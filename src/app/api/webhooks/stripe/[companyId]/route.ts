import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getStripeForCompany } from "@/lib/payments/stripe";
import { reconcileCheckoutEvent } from "@/lib/payments/webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    const { stripe, secrets } = await getStripeForCompany(client, companyId);
    if (!secrets.webhookSecret) throw new Error("Stripe webhook secret is not configured for this legal entity");
    const event = stripe.webhooks.constructEvent(rawBody, signature, secrets.webhookSecret);
    const result = await reconcileCheckoutEvent({ client, companyId, event, rawBody });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook failed" }, { status: 400 });
  }
}
