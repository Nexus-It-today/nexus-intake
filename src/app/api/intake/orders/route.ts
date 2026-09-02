/**
 * Unified authenticated intake endpoint. Every accepted request is retained
 * before mapping and processing, so a downstream failure cannot erase it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeStandardOrder, toIntakeOrderInput } from "@/lib/intake/standardOrder";
import { processIntake } from "@/lib/intake/intakeService";
import { notifyOrderCreated } from "@/lib/notify/orderCreated";
import {
  markReceiptFailed,
  markReceiptProcessed,
  markReceiptProcessing,
  payloadHash,
  persistReceipt,
} from "@/lib/intake/durableReceipt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAuthClient() {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createPrivilegedClient() {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseBearerToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  let receiptId: string | null = null;
  let privilegedClient: ReturnType<typeof createPrivilegedClient> = null;
  try {
    const authClient = createAuthClient();
    privilegedClient = createPrivilegedClient();
    if (!authClient || !privilegedClient) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const rawPayload = await request.text();
    const body = JSON.parse(rawPayload || "{}") as {
      event_id?: string;
      order?: unknown;
      company_id?: string;
      customer_id?: string;
      booking_profile_id?: string;
      booking_profile_name?: string;
      merchant_id?: string;
      sales_channel_id?: string;
      sales_channel_name?: string;
    };

    let companyId = body.company_id?.trim() || "";
    let userId: string | null = null;
    const token = parseBearerToken(request);
    if (token) {
      const { data: { user } } = await authClient.auth.getUser(token);
      userId = user?.id ?? null;
      if (userId && !companyId) {
        const { data: profile } = await privilegedClient
          .from("profiles")
          .select("company_id")
          .eq("auth_user_id", userId)
          .maybeSingle();
        companyId = profile?.company_id ?? "";
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "No company linked to this intake request. Sign in or provide company_id." },
        { status: 403 },
      );
    }

    const order = sanitizeStandardOrder(body.order);
    const intakeInput = toIntakeOrderInput(order, {
      companyId,
      createdByUserId: userId,
      customerId: body.customer_id?.trim() || null,
      bookingProfileId: body.booking_profile_id?.trim() || null,
      bookingProfileName: body.booking_profile_name?.trim() || null,
      salesChannelId: body.sales_channel_id?.trim() || null,
      salesChannelName: body.sales_channel_name?.trim() || order.salesChannel.trim() || null,
    });

    const eventId =
      body.event_id?.trim() ||
      request.headers.get("x-nexus-event-id")?.trim() ||
      `payload:${payloadHash(rawPayload)}`;
    const receipt = await persistReceipt(
      privilegedClient,
      {
        companyId,
        sourceSystem: intakeInput.sourceSystem || "nexus_form",
        eventType: "order.submitted",
        externalEventId: eventId,
        externalOrderId: intakeInput.externalOrderId,
        payload: body,
      },
      rawPayload,
    );
    receiptId = receipt.id;

    if (receipt.duplicate && receipt.status === "processed") {
      return NextResponse.json({
        success: true,
        duplicate: true,
        receiptId: receipt.id,
        jobId: receipt.draftJobId,
      });
    }
    if (receipt.duplicate && receipt.status === "processing") {
      return NextResponse.json(
        { success: true, retained: true, processing: true, receiptId: receipt.id },
        { status: 202 },
      );
    }

    await markReceiptProcessing(privilegedClient, receipt.id);
    const result = await processIntake(intakeInput, privilegedClient);
    if (!result.success) {
      await markReceiptFailed(privilegedClient, receipt.id, result.error || "Intake processing failed");
      return NextResponse.json({ error: result.error, receiptId: receipt.id, retained: true }, { status: 400 });
    }

    await markReceiptProcessed(
      privilegedClient,
      receipt.id,
      companyId,
      result.jobId,
      `${intakeInput.sourceSystem}:${companyId}:${intakeInput.externalOrderId || eventId}`,
    );

    await notifyOrderCreated({
      client: privilegedClient,
      draftJobId: result.jobId,
      companyId,
      orderReference: result.jobReference,
      customerName: order.delivery.contact || order.delivery.company || order.customer,
      customerEmail: order.delivery.email || order.collection.email,
      customerPhone: order.delivery.phone || order.collection.phone,
    });

    return NextResponse.json({
      success: true,
      receiptId: receipt.id,
      jobId: result.jobId,
      jobReference: result.jobReference,
      lifecycleStatus: result.lifecycleStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    if (receiptId && privilegedClient) {
      await markReceiptFailed(privilegedClient, receiptId, message);
    }
    console.error("[intake/orders] unhandled error", error);
    return NextResponse.json({ error: message, receiptId, retained: Boolean(receiptId) }, { status: 500 });
  }
}
