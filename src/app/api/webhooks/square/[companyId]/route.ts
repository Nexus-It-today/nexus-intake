import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSquareWebhookConfig, retainAndReconcileSquare, verifySquareSignature, type SquareWebhook } from "@/lib/payments/square";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") ?? "";
    const config = await getSquareWebhookConfig(client, companyId);
    if (!signature || !verifySquareSignature({ rawBody, signature, signatureKey: config.signatureKey, notificationUrl: config.notificationUrl })) {
      return NextResponse.json({ error: "Invalid Square signature" }, { status: 403 });
    }
    const event = JSON.parse(rawBody) as SquareWebhook;
    if (config.merchantId && event.merchant_id !== config.merchantId) {
      return NextResponse.json({ error: "Square merchant does not match this legal entity" }, { status: 403 });
    }
    return NextResponse.json(await retainAndReconcileSquare({ client, companyId, event, rawBody }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Square webhook failed" }, { status: 400 });
  }
}
