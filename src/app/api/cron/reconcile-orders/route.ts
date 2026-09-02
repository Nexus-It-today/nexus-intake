import { NextRequest, NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";

export const runtime = "nodejs";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = createPrivilegedClient();
  if (!client) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const invoiceBefore = new Date(Date.now() - 30 * 60_000).toISOString();

  const [{ data: receipts, error: receiptError }, { data: invoices, error: invoiceError }] = await Promise.all([
    client.from("order_ingestion_events")
      .select("id, company_id, source_system, external_order_id, processing_status, last_error, received_at")
      .in("processing_status", ["received", "processing", "failed"]).lt("received_at", staleBefore).limit(500),
    client.from("draft_jobs").select("id, company_id, job_reference, created_at")
      .eq("invoice_required", true).is("xero_draft_invoice_id", null).lt("created_at", invoiceBefore).limit(500),
  ]);
  if (receiptError || invoiceError) {
    return NextResponse.json({ error: receiptError?.message ?? invoiceError?.message }, { status: 500 });
  }

  const exceptions = [
    ...(receipts ?? []).map((row) => ({
      company_id: row.company_id, exception_key: `stale-intake:${row.id}`,
      exception_type: "order_intake_stalled",
      severity: row.processing_status === "failed" ? "urgent" : "warning",
      source_system: row.source_system, external_order_id: row.external_order_id,
      details: { receiptId: row.id, status: row.processing_status, receivedAt: row.received_at, error: row.last_error },
      status: "open", last_detected_at: new Date().toISOString(),
    })),
    ...(invoices ?? []).map((row) => ({
      company_id: row.company_id, exception_key: `missing-invoice:${row.id}`,
      exception_type: "required_invoice_missing", severity: "urgent", source_system: "xero",
      external_order_id: row.job_reference, draft_job_id: row.id,
      details: { jobReference: row.job_reference, createdAt: row.created_at },
      status: "open", last_detected_at: new Date().toISOString(),
    })),
  ];
  if (exceptions.length) {
    const { error } = await client.from("reconciliation_exceptions").upsert(exceptions, { onConflict: "company_id,exception_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ checkedAt: new Date().toISOString(), staleIntake: receipts?.length ?? 0, missingInvoices: invoices?.length ?? 0 });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
