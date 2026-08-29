import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";

type TrackItLeg = {
  id: string;
  merchant_id: string;
  logical_order_id: string;
  provider_order_id: string;
  track_id: string | null;
  journey_leg: string;
  order_date: string | null;
  status: string | null;
  track_link: string | null;
  contact_name: string | null;
  last_seen_at: string;
};

export async function GET(request: NextRequest) {
  const session = await getMerchantSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { privilegedClient, companyId, merchantId, isPlatformAdmin } = session;
  const params = request.nextUrl.searchParams;
  const requestedMerchantId = (params.get("merchantId") ?? "").trim();
  const limitParam = Number(params.get("limit") ?? "300");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.trunc(limitParam), 500))
    : 300;

  let query = privilegedClient
    .from("track_it_order_legs")
    .select(
      "id, merchant_id, logical_order_id, provider_order_id, track_id, journey_leg, order_date, status, track_link, contact_name, last_seen_at"
    )
    .eq("company_id", companyId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (isPlatformAdmin) {
    if (requestedMerchantId) query = query.eq("merchant_id", requestedMerchantId);
  } else if (merchantId) {
    query = query.eq("merchant_id", merchantId);
  } else {
    return NextResponse.json({ error: "No active merchant membership linked to user" }, { status: 403 });
  }

  const { data: legs, error: legsError } = await query.returns<TrackItLeg[]>();
  if (legsError) {
    return NextResponse.json({ error: legsError.message }, { status: 500 });
  }

  const merchantIds = [...new Set((legs ?? []).map((leg) => leg.merchant_id))];
  const logicalOrderIds = [...new Set((legs ?? []).map((leg) => leg.logical_order_id))];

  const merchantNames = new Map<string, string>();
  if (merchantIds.length > 0) {
    const { data: merchants } = await privilegedClient
      .from("merchants")
      .select("id, name")
      .in("id", merchantIds);
    for (const merchant of merchants ?? []) {
      merchantNames.set(String(merchant.id), String(merchant.name ?? ""));
    }
  }

  const logicalRefs = new Map<string, string>();
  if (logicalOrderIds.length > 0) {
    const { data: logicalOrders } = await privilegedClient
      .from("track_it_logical_orders")
      .select("id, logical_order_reference")
      .in("id", logicalOrderIds);
    for (const logicalOrder of logicalOrders ?? []) {
      logicalRefs.set(String(logicalOrder.id), String(logicalOrder.logical_order_reference ?? ""));
    }
  }

  return NextResponse.json({
    orders: (legs ?? []).map((leg) => ({
      id: leg.id,
      merchantId: leg.merchant_id,
      merchantName: merchantNames.get(leg.merchant_id) ?? "—",
      logicalOrderReference: logicalRefs.get(leg.logical_order_id) ?? "—",
      providerOrderId: leg.provider_order_id,
      trackId: leg.track_id ?? "",
      journeyLeg: leg.journey_leg,
      orderDate: leg.order_date ?? "",
      status: leg.status ?? "",
      trackingUrl: leg.track_link ?? "",
      contactName: leg.contact_name ?? "",
      updatedAt: leg.last_seen_at,
    })),
  });
}
