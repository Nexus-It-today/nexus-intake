import { NextRequest, NextResponse } from "next/server";
import { getCustomerPreviewContext } from "@/lib/platform/customerPreview";
import { toDashboardRow } from "@/lib/orders/dashboard";

type DashboardListRow = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const context = await getCustomerPreviewContext(request, customerId);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { companyId, merchantCustomerId, customerEmail, customerName, contactName, privilegedClient } = context.value;
  const safeEmail = customerEmail.replaceAll(",", " ").toLowerCase();

  const { data, error } = await privilegedClient
    .from("draft_jobs")
    .select(
      [
        "id",
        "job_reference",
        "external_order_id",
        "customer",
        "collection_company",
        "delivery_company",
        "delivery_postcode",
        "lifecycle_status",
        "status",
        "trackpod_delivery_order_id",
        "sales_channel_name",
        "created_at",
      ].join(", ")
    )
    .eq("company_id", companyId)
    .or(`customer_id.eq.${merchantCustomerId},customer_email.ilike.%${safeEmail}%`)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DashboardListRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((item) => toDashboardRow(item));

  return NextResponse.json({
    customer: { id: merchantCustomerId, name: customerName, email: customerEmail || null, contactName },
    orders,
  });
}
