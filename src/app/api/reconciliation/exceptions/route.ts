import { NextRequest, NextResponse } from "next/server";
import { getMerchantContext } from "@/lib/serverAuth";

export async function GET(request: NextRequest) {
  const context = await getMerchantContext(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const status = request.nextUrl.searchParams.get("status")?.trim() || "open";
  const { data, error } = await context.value.privilegedClient
    .from("reconciliation_exceptions")
    .select("id, exception_type, severity, source_system, external_order_id, draft_job_id, details, status, first_detected_at, last_detected_at, resolved_at")
    .eq("company_id", context.value.companyId)
    .eq("status", status)
    .order("last_detected_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exceptions: data ?? [] });
}
