import { createHash } from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

function objectId(value: string | Stripe.PaymentIntent | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function reconcileCheckoutEvent(args: {
  client: SupabaseClient;
  companyId: string;
  event: Stripe.Event;
  rawBody: string;
}) {
  const { client, companyId, event, rawBody } = args;
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};
  const requestId = metadata.nexus_payment_request_id ?? "";
  const draftJobId = metadata.nexus_draft_job_id ?? "";
  const eventStatus = event.type === "checkout.session.completed" && session.payment_status === "paid" ? "succeeded" : event.type;

  const { error: receiptError } = await client.from("payment_events").upsert({
    company_id: companyId,
    provider: "stripe",
    provider_event_id: event.id,
    provider_payment_id: objectId(session.payment_intent),
    nexus_booking_reference: metadata.nexus_booking_reference ?? null,
    event_type: event.type,
    status: eventStatus,
    amount_minor: session.amount_total,
    currency: session.currency,
    payload: event,
    payload_sha256: createHash("sha256").update(rawBody).digest("hex"),
    draft_job_id: draftJobId || null,
    match_status: requestId && draftJobId ? "unmatched" : "mismatch",
    last_error: requestId && draftJobId ? null : "Missing Nexus payment metadata",
  }, { onConflict: "company_id,provider,provider_event_id", ignoreDuplicates: true });
  if (receiptError) throw new Error(`Could not retain Stripe event: ${receiptError.message}`);

  if (event.type !== "checkout.session.completed" || session.payment_status !== "paid") {
    return { accepted: true, reconciled: false };
  }
  if (!requestId || !draftJobId || metadata.nexus_company_id !== companyId) {
    throw new Error("Stripe event is missing or has mismatched Nexus metadata");
  }

  const { data: request, error: requestError } = await client
    .from("payment_requests")
    .select("id, draft_job_id, amount_minor, currency, status")
    .eq("id", requestId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; draft_job_id: string; amount_minor: number; currency: string; status: string }>();
  if (requestError) throw new Error(requestError.message);
  if (!request || request.draft_job_id !== draftJobId) throw new Error("No matching Nexus payment request");

  const amountMatches = Number(request.amount_minor) === Number(session.amount_total);
  const currencyMatches = request.currency.toLowerCase() === (session.currency ?? "").toLowerCase();
  if (!amountMatches || !currencyMatches) {
    await client.from("payment_events").update({ match_status: "mismatch", last_error: "Amount or currency mismatch" })
      .eq("company_id", companyId).eq("provider", "stripe").eq("provider_event_id", event.id);
    await client.from("reconciliation_exceptions").upsert({
      company_id: companyId,
      exception_key: `stripe-payment-mismatch:${event.id}`,
      exception_type: "payment_amount_mismatch",
      severity: "critical",
      source_system: "stripe",
      draft_job_id: draftJobId,
      details: { expected_amount_minor: request.amount_minor, received_amount_minor: session.amount_total, expected_currency: request.currency, received_currency: session.currency },
      status: "open",
      last_detected_at: new Date().toISOString(),
    }, { onConflict: "company_id,exception_key" });
    throw new Error("Stripe payment amount or currency does not match the order");
  }

  const paidAt = new Date(event.created * 1000).toISOString();
  const paymentIntentId = objectId(session.payment_intent);
  const { error: updateRequestError } = await client.from("payment_requests").update({
    status: "paid", payment_intent_id: paymentIntentId, paid_at: paidAt, last_error: null,
  }).eq("id", requestId).eq("company_id", companyId);
  if (updateRequestError) throw new Error(updateRequestError.message);

  const { error: jobError } = await client.from("draft_jobs").update({
    payment_status: "paid", payment_provider: "stripe", payment_request_id: requestId,
    payment_provider_id: paymentIntentId, paid_at: paidAt,
  }).eq("id", draftJobId).eq("company_id", companyId);
  if (jobError) throw new Error(jobError.message);

  const { error: outboxError } = await client.from("integration_outbox").upsert({
    company_id: companyId,
    draft_job_id: draftJobId,
    destination: "trackpod",
    operation: "release_paid_order",
    idempotency_key: `stripe-paid:${requestId}`,
    payload: { payment_request_id: requestId, payment_intent_id: paymentIntentId },
    status: "pending",
  }, { onConflict: "destination,operation,idempotency_key", ignoreDuplicates: true });
  if (outboxError) throw new Error(outboxError.message);

  await client.from("payment_events").update({ match_status: "matched", matched_at: new Date().toISOString(), draft_job_id: draftJobId, last_error: null })
    .eq("company_id", companyId).eq("provider", "stripe").eq("provider_event_id", event.id);
  return { accepted: true, reconciled: true, draftJobId };
}
