import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { decryptCredentials } from "@/lib/integrations/credentials";
import { getConnectionRow } from "@/lib/integrations/service";
import { sanitizeStandardOrder, toIntakeOrderInput } from "@/lib/intake/standardOrder";
import { processIntake } from "@/lib/intake/intakeService";
import { markReceiptFailed, markReceiptProcessed, markReceiptProcessing, payloadHash, persistReceipt } from "@/lib/intake/durableReceipt";
import { notifyOrderCreated } from "@/lib/notify/orderCreated";

export const runtime = "nodejs";

function secretFrom(credentials: Record<string, unknown>): string {
  for (const key of ["formSigningSecret", "webhookSecret", "signingSecret"]) {
    const value = credentials[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function validSignature(rawBody: string, supplied: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try { received = Buffer.from(supplied.replace(/^sha256=/, ""), "hex"); } catch { return false; }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let receiptId: string | null = null;
  try {
    const rawBody = await request.text();
    const connection = await getConnectionRow(client, companyId, "nexus_forms");
    if (!connection?.connected || !connection.credentials_ciphertext || !connection.credentials_iv || !connection.credentials_tag) {
      return NextResponse.json({ error: "Website form intake is not connected for this legal entity" }, { status: 403 });
    }
    const credentials = decryptCredentials({
      ciphertext: String(connection.credentials_ciphertext), iv: String(connection.credentials_iv), tag: String(connection.credentials_tag),
    });
    const signingSecret = secretFrom(credentials);
    const suppliedSignature = request.headers.get("x-nexus-form-signature") ?? "";
    if (!signingSecret || !suppliedSignature || !validSignature(rawBody, suppliedSignature, signingSecret)) {
      return NextResponse.json({ error: "Invalid form signature" }, { status: 403 });
    }

    const body = JSON.parse(rawBody || "{}") as {
      event_id?: string; order?: unknown; merchant_id?: string; customer_id?: string;
      booking_profile_id?: string; booking_profile_name?: string;
      sales_channel_id?: string; sales_channel_name?: string;
    };
    const order = sanitizeStandardOrder(body.order);
    if (!["public_webform", "embedded_webform"].includes(order.sourceSystem)) {
      return NextResponse.json({ error: "Public intake only accepts website-form orders" }, { status: 400 });
    }
    const input = toIntakeOrderInput(order, {
      companyId, createdByUserId: null,
      customerId: body.customer_id?.trim() || null, bookingProfileId: body.booking_profile_id?.trim() || null,
      bookingProfileName: body.booking_profile_name?.trim() || null,
      salesChannelId: body.sales_channel_id?.trim() || null,
      salesChannelName: body.sales_channel_name?.trim() || order.salesChannel.trim() || "Website Form",
    });
    const eventId = body.event_id?.trim() || request.headers.get("x-nexus-event-id")?.trim() || `payload:${payloadHash(rawBody)}`;
    const receipt = await persistReceipt(client, {
      companyId, sourceSystem: input.sourceSystem, eventType: "order.submitted", externalEventId: eventId,
      externalOrderId: input.externalOrderId, payload: body,
    }, rawBody);
    receiptId = receipt.id;
    if (receipt.duplicate && receipt.status === "processed") {
      return NextResponse.json({ success: true, duplicate: true, receiptId, jobId: receipt.draftJobId });
    }
    if (receipt.duplicate && receipt.status === "processing") {
      return NextResponse.json({ success: true, retained: true, processing: true, receiptId }, { status: 202 });
    }
    await markReceiptProcessing(client, receiptId);
    const result = await processIntake(input, client);
    if (!result.success) {
      await markReceiptFailed(client, receiptId, result.error);
      return NextResponse.json({ error: result.error, retained: true, receiptId }, { status: 400 });
    }
    await markReceiptProcessed(client, receiptId, companyId, result.jobId, `${input.sourceSystem}:${companyId}:${input.externalOrderId || eventId}`);
    await notifyOrderCreated({
      client, draftJobId: result.jobId, companyId, orderReference: result.jobReference,
      customerName: order.delivery.contact || order.delivery.company || order.customer,
      customerEmail: order.delivery.email || order.collection.email,
      customerPhone: order.delivery.phone || order.collection.phone,
    });
    return NextResponse.json({ success: true, retained: true, receiptId, jobId: result.jobId, jobReference: result.jobReference, lifecycleStatus: result.lifecycleStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Public intake failed";
    if (receiptId) await markReceiptFailed(client, receiptId, message);
    return NextResponse.json({ error: message, retained: Boolean(receiptId), receiptId }, { status: 500 });
  }
}
