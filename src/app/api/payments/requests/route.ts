import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canManageMerchants, getMerchantContext } from "@/lib/serverAuth";
import { currencyMinor, getStripeForCompany, paymentMetadata } from "@/lib/payments/stripe";

type JobRow = {
  id: string; company_id: string; job_reference: string | null; delivery_email: string | null;
  commercial_total: string | null; goods_description: string | null;
};

export async function POST(request: NextRequest) {
  const context = await getMerchantContext(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  try {
    const body = (await request.json().catch(() => ({}))) as { draftJobId?: string };
    const draftJobId = typeof body.draftJobId === "string" ? body.draftJobId.trim() : "";
    if (!draftJobId) return NextResponse.json({ error: "draftJobId is required" }, { status: 400 });

    let jobQuery = context.value.privilegedClient.from("draft_jobs")
      .select("id, company_id, job_reference, delivery_email, commercial_total, goods_description")
      .eq("id", draftJobId);
    if (!canManageMerchants(context.value.role)) jobQuery = jobQuery.eq("company_id", context.value.companyId);
    const { data: job, error: jobError } = await jobQuery.maybeSingle<JobRow>();
    if (jobError) throw new Error(jobError.message);
    if (!job) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const targetCompanyId = job.company_id;
    const amountMinor = currencyMinor(job.commercial_total);
    if (!amountMinor) return NextResponse.json({ error: "Order needs a positive commercial total before a payment link can be created" }, { status: 409 });

    const paymentRequestId = randomUUID();
    const idempotencyKey = `nexus-payment-${paymentRequestId}`;
    const bookingReference = job.job_reference?.trim() || job.id.slice(0, 8).toUpperCase();
    const { error: insertError } = await context.value.privilegedClient.from("payment_requests").insert({
      id: paymentRequestId, company_id: targetCompanyId, draft_job_id: job.id,
      amount_minor: amountMinor, currency: "gbp", status: "creating", idempotency_key: idempotencyKey,
      customer_email: job.delivery_email, created_by_user_id: context.value.user.id,
      metadata: { booking_reference: bookingReference },
    });
    if (insertError) throw new Error(insertError.message);

    try {
      const { stripe } = await getStripeForCompany(context.value.privilegedClient, targetCompanyId);
      const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
      const metadata = paymentMetadata({ companyId: targetCompanyId, draftJobId: job.id, paymentRequestId, bookingReference });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: bookingReference,
        customer_email: job.delivery_email || undefined,
        metadata,
        payment_intent_data: { metadata },
        line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: amountMinor, product_data: { name: `Delivery ${bookingReference}`, description: job.goods_description?.slice(0, 500) || undefined } } }],
        success_url: `${origin}/process-it?payment=success&reference=${encodeURIComponent(bookingReference)}`,
        cancel_url: `${origin}/process-it?payment=cancelled&reference=${encodeURIComponent(bookingReference)}`,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      }, { idempotencyKey });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      const { error: updateError } = await context.value.privilegedClient.from("payment_requests").update({
        status: "pending", checkout_session_id: session.id, checkout_url: session.url,
        expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      }).eq("id", paymentRequestId);
      if (updateError) throw new Error(updateError.message);
      await context.value.privilegedClient.from("draft_jobs").update({ payment_status: "pending", payment_provider: "stripe", payment_request_id: paymentRequestId }).eq("id", job.id);
      return NextResponse.json({ success: true, paymentRequestId, checkoutUrl: session.url, expiresAt: session.expires_at });
    } catch (error) {
      await context.value.privilegedClient.from("payment_requests").update({ status: "failed", last_error: error instanceof Error ? error.message : "Stripe request failed" }).eq("id", paymentRequestId);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create payment link" }, { status: 500 });
  }
}
