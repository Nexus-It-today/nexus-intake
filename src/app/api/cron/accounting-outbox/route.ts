import { NextRequest, NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { dispatchXeroInvoice } from "@/lib/accounting/xeroWorker";
import { claimOutbox, deliverOutbox, failOutbox } from "@/lib/outbox/worker";

export const runtime = "nodejs";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = createPrivilegedClient();
  if (!client) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const rows = await claimOutbox(client, "accounting", 10);
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    try {
      const result = await dispatchXeroInvoice(client, row);
      await deliverOutbox(client, row.id);
      results.push({ id: row.id, ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accounting dispatch failed";
      await failOutbox(client, row, message);
      results.push({ id: row.id, ok: false, error: message });
    }
  }
  return NextResponse.json({ claimed: rows.length, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
