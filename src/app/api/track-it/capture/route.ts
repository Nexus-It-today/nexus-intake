import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const trackPodApiKey = process.env.TRACKPOD_API_KEY ?? "";
const trackPodApiBaseUrl = (process.env.TRACKPOD_API_BASE_URL ?? "https://api.track-pod.com").replace(/\/+$/, "");

function serviceClient() {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function callerClient(token: string) {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function enumerateDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 7) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function orderArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map(asRecord);
  const record = asRecord(payload);
  for (const key of ["Orders", "orders", "OrderList", "orderList", "Items", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(asRecord);
  }
  return Object.keys(record).length ? [record] : [];
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function emailCount(value: string): number {
  if (!value) return 0;
  return new Set(
    value
      .split(/[;,]/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.includes("@"))
  ).size;
}

function journeyLeg(order: Record<string, unknown>): "COLLECTION" | "DELIVERY" {
  const raw = order.Type ?? order.type;
  if (raw === 1 || raw === "1") return "COLLECTION";
  const label = text(order, "OrderType", "orderType", "TypeName", "typeName").toLowerCase();
  return label.includes("collect") || label.includes("pickup") ? "COLLECTION" : "DELIVERY";
}

async function trackPodGet(path: string): Promise<unknown> {
  if (!trackPodApiKey) throw new Error("TRACKPOD_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${trackPodApiBaseUrl}${path}`, {
      headers: { "X-API-KEY": trackPodApiKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw Object.assign(new Error(`Track-POD returned HTTP ${response.status}`), {
        status: response.status,
      });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveContext(userId: string) {
  const db = serviceClient();
  if (!db) throw new Error("Supabase is not configured");

  const { data: superAdmin } = await db
    .from("platform_super_admins")
    .select("profile_id")
    .eq("profile_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!superAdmin) throw Object.assign(new Error("Platform super-admin access is required"), { status: 403 });

  const { data: membership } = await db
    .from("company_memberships")
    .select("company_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle<{ company_id: string }>();
  if (!membership?.company_id) throw Object.assign(new Error("No active company membership found"), { status: 403 });

  const { data: merchants } = await db
    .from("merchants")
    .select("id, name, reference")
    .eq("company_id", membership.company_id)
    .eq("status", "active");

  let { data: connection } = await db
    .from("integration_connections")
    .select("id, status")
    .eq("company_id", membership.company_id)
    .eq("integration_key", "track-pod")
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();

  if (!connection) {
    const inserted = await db
      .from("integration_connections")
      .insert({
        company_id: membership.company_id,
        integration_key: "track-pod",
        status: "not_configured",
        config: { credential_source: "vercel_environment" },
      })
      .select("id, status")
      .single<{ id: string; status: string }>();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Could not create Track-POD connection record");
    connection = inserted.data;
  }

  return { db, companyId: membership.company_id, connection, merchants: merchants ?? [] };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });

  try {
    const { db, connection } = await resolveContext(session.user.id);
    if (!trackPodApiKey) {
      return NextResponse.json({ configured: false, connected: false, status: connection.status });
    }

    await trackPodGet("/Test");
    await db
      .from("integration_connections")
      .update({ status: "connected", connected_at: new Date().toISOString(), last_error: null })
      .eq("id", connection.id);

    return NextResponse.json({ configured: true, connected: true, status: "connected" });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Track-POD connection check failed" }, { status });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });

  let context: Awaited<ReturnType<typeof resolveContext>> | null = null;
  try {
    context = await resolveContext(session.user.id);
    const { db, companyId, connection, merchants } = context;
    if (!trackPodApiKey) throw Object.assign(new Error("Track-POD API key is not configured in Vercel"), { status: 503 });

    await trackPodGet("/Test");

    const body = (await request.json().catch(() => ({}))) as { startDate?: string; endDate?: string };
    const today = new Date();
    const start = parseDate(body.startDate, today);
    const end = parseDate(body.endDate, start);
    if (end < start) throw Object.assign(new Error("endDate must be on or after startDate"), { status: 400 });
    const dates = enumerateDates(start, end);
    if (dates.length === 7) {
      const requestedEnd = isoDate(end);
      if (dates[6] !== requestedEnd) throw Object.assign(new Error("A capture may cover at most 7 days"), { status: 400 });
    }

    const merchantMap = new Map<string, string>();
    for (const merchant of merchants as Array<{ id: string; name: string; reference: string | null }>) {
      merchantMap.set(normalized(merchant.name), merchant.id);
      if (merchant.reference) merchantMap.set(normalized(merchant.reference), merchant.id);
    }

    const providerOrders: Array<Record<string, unknown> & { _captureDate: string }> = [];
    for (const date of dates) {
      const payload = await trackPodGet(`/Order/Date/${encodeURIComponent(date)}`);
      for (const order of orderArray(payload)) providerOrders.push({ ...order, _captureDate: date });
    }

    const legs: Record<string, unknown>[] = [];
    const exceptions: Record<string, string>[] = [];
    const logicalReferences = new Set<string>();

    for (const order of providerOrders) {
      const logicalOrderReference = text(order, "Number", "number", "OrderNumber", "orderNumber", "Id", "id");
      const trackId = text(order, "TrackId", "trackId", "TrackID", "trackID");
      if (!logicalOrderReference || !trackId) {
        exceptions.push({
          type: "provider_record_missing_identifier",
          safeSummary: "A Track-POD order was skipped because its order reference or TrackId was missing.",
          logicalOrderReference,
        });
        continue;
      }

      logicalReferences.add(logicalOrderReference);
      const shipper = text(order, "Shipper", "shipper");
      const merchantId = merchantMap.get(normalized(shipper)) ?? null;
      const orderDate = text(order, "Date", "date", "OrderDate", "orderDate") || order._captureDate;
      const recipientEmails = text(order, "Email", "email");

      legs.push({
        logicalOrderReference,
        merchantId,
        providerOrderId: text(order, "Id", "id"),
        trackId,
        journeyLeg: journeyLeg(order),
        orderDate: orderDate.slice(0, 10),
        status: text(order, "Status", "status", "OrderStatus", "orderStatus"),
        trackLink: text(order, "TrackLink", "trackLink"),
        contactName: text(order, "ContactName", "contactName", "Client", "client"),
        recipientEmailCount: emailCount(recipientEmails),
      });
    }

    const rpcClient = callerClient(session.token);
    if (!rpcClient) throw new Error("Supabase caller client is not configured");

    const batch = {
      company_id: companyId,
      merchant_id: "",
      integration_connection_id: connection.id,
      requested_start_date: dates[0],
      requested_end_date: dates[dates.length - 1],
      order_dates_requested: dates,
      records_seen: providerOrders.length,
      logical_orders_seen: logicalReferences.size,
      legs_upserted: legs.length,
      held_acknowledgements: 0,
      legs,
      held_acknowledgements_preview: [],
      exceptions,
    };

    const { data: captured, error: captureError } = await rpcClient.rpc("capture_trackpod_prepared_batch", { batch });
    if (captureError) throw new Error(captureError.message);

    await db
      .from("integration_connections")
      .update({
        status: "connected",
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", connection.id);

    return NextResponse.json({
      success: true,
      dates,
      recordsSeen: providerOrders.length,
      logicalOrdersSeen: logicalReferences.size,
      legsCaptured: legs.length,
      exceptions: exceptions.length,
      capture: captured,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    if (context) {
      await context.db
        .from("integration_connections")
        .update({ status: status === 401 ? "error" : "degraded", last_error: error instanceof Error ? error.message : "Track-POD capture failed" })
        .eq("id", context.connection.id);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Track-POD capture failed" }, { status });
  }
}
