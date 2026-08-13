import { NextRequest, NextResponse } from "next/server";
import { getPlatformContext } from "@/lib/platform/requestContext";
import { canAccessMerchant } from "@/lib/platform/permissions";

type OrderRow = {
  id: string;
  merchant_id: string | null;
  job_reference: string | null;
  external_order_id: string | null;
  customer: string | null;
  lifecycle_status: string | null;
  current_status: string | null;
  route_status: string | null;
  trackpod_delivery_tracking_url: string | null;
  trackpod_collection_tracking_url: string | null;
  trackpod_error_detail: unknown;
  trackpod_error_at: string | null;
  requested_collection_date: string | null;
  requested_delivery_date: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  const ctx = await getPlatformContext(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const requestedMerchantId = (request.nextUrl.searchParams.get("merchantId") ?? "").trim();
  const contextMerchantId = ctx.activeContext.type === "merchant" ? ctx.activeContext.id : "";
  const merchantId = requestedMerchantId || contextMerchantId;

  if (!merchantId) {
    return NextResponse.json({ error: "Switch into a merchant context to view Track-POD/order data." }, { status: 400 });
  }

  if (!canAccessMerchant(ctx.accessProfile, merchantId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.trunc(limitParam))) : 100;
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();

  let query = ctx.privilegedClient
    .from("draft_jobs")
    .select(
      "id, merchant_id, job_reference, external_order_id, customer, lifecycle_status, current_status, route_status, trackpod_delivery_tracking_url, trackpod_collection_tracking_url, trackpod_error_detail, trackpod_error_at, requested_collection_date, requested_delivery_date, created_at, updated_at"
    )
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    const safe = search.replaceAll(",", " ").replaceAll("%", "");
    query = query.or(`job_reference.ilike.%${safe}%,external_order_id.ilike.%${safe}%,customer.ilike.%${safe}%`);
  }

  const { data, error } = await query.returns<OrderRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    merchantId,
    orders:
      (data ?? []).map((row) => ({
        id: row.id,
        reference: row.job_reference || row.external_order_id || row.id.slice(0, 8),
        customer: row.customer || "—",
        lifecycleStatus: row.lifecycle_status || "unknown",
        status: row.current_status || "unknown",
        routeStatus: row.route_status || "not_planned",
        requestedCollectionDate: row.requested_collection_date,
        requestedDeliveryDate: row.requested_delivery_date,
        trackingLinks: {
          collection: row.trackpod_collection_tracking_url,
          delivery: row.trackpod_delivery_tracking_url,
        },
        exception: row.trackpod_error_detail || row.trackpod_error_at ? "Exception" : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) ?? [],
  });
}
