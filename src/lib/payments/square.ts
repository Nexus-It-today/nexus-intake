import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentials } from "@/lib/integrations/credentials";
import { getConnectionRow } from "@/lib/integrations/service";
import { currencyMinor } from "@/lib/payments/stripe";

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  reference_id?: string;
  note?: string;
  created_at?: string;
  amount_money?: { amount?: number | string; currency?: string };
};

export type SquareWebhook = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: { object?: { payment?: SquarePayment } };
};

function stringValue(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function getSquareWebhookConfig(client: SupabaseClient, companyId: string) {
  const connection = await getConnectionRow(client, companyId, "square");
  if (!connection?.connected) throw new Error("Square is not connected for this legal entity");
  if (!connection.credentials_ciphertext || !connection.credentials_iv || !connection.credentials_tag) {
    throw new Error("Square credentials are missing for this legal entity");
  }
  const credentials = decryptCredentials({
    ciphertext: String(connection.credentials_ciphertext),
    iv: String(connection.credentials_iv),
    tag: String(connection.credentials_tag),
  });
  const signatureKey = stringValue(credentials, ["signatureKey", "webhookSignatureKey"]);
  const configuration = connection.configuration && typeof connection.configuration === "object" && !Array.isArray(connection.configuration)
    ? connection.configuration as Record<string, unknown>
    : {};
  const notificationUrl = stringValue(configuration, ["notificationUrl", "webhookUrl"]);
  const merchantId = stringValue(credentials, ["merchantId", "squareMerchantId"]);
  if (!signatureKey || !notificationUrl) throw new Error("Square webhook signature key or notification URL is missing");
  return { signatureKey, notificationUrl, merchantId };
}

export function verifySquareSignature(args: { rawBody: string; signature: string; signatureKey: string; notificationUrl: string }) {
  const expected = createHmac("sha256", args.signatureKey)
    .update(args.notificationUrl + args.rawBody, "utf8")
    .digest();
  let received: Buffer;
  try { received = Buffer.from(args.signature, "base64"); } catch { return false; }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function referenceCandidates(payment: SquarePayment): string[] {
  const candidates = [payment.reference_id, payment.order_id].filter((value): value is string => Boolean(value?.trim()));
  const note = payment.note ?? "";
  for (const match of note.matchAll(/\b(?:NEX-[A-Z0-9-]+|Q-[A-Z0-9-]+|\d{3,10})\b/gi)) candidates.push(match[0]);
  return [...new Set(candidates.map((value) => value.trim()))];
}

export async function retainAndReconcileSquare(args: {
  client: SupabaseClient; companyId: string; event: SquareWebhook; rawBody: string;
}) {
  const payment = args.event.data?.object?.payment ?? {};
  const eventId = args.event.event_id?.trim() || "";
  const paymentId = payment.id?.trim() || "";
  if (!eventId || !paymentId) throw new Error("Square webhook is missing event or payment ID");
  const amountMinor = Number(payment.amount_money?.amount ?? 0);
  const currency = payment.amount_money?.currency?.toLowerCase() || null;
  const candidates = referenceCandidates(payment);
  const completed = payment.status === "COMPLETED";

  const { error: receiptError } = await args.client.from("payment_events").upsert({
    company_id: args.companyId, provider: "square", provider_event_id: eventId,
    provider_payment_id: paymentId, nexus_booking_reference: candidates[0] ?? null,
    external_order_id: payment.order_id ?? null, event_type: args.event.type || "payment.updated",
    status: payment.status || "UNKNOWN", amount_minor: amountMinor || null, currency,
    payload: args.event, payload_sha256: createHash("sha256").update(args.rawBody).digest("hex"),
    match_status: "unmatched",
  }, { onConflict: "company_id,provider,provider_event_id", ignoreDuplicates: true });
  if (receiptError) throw new Error(`Could not retain Square event: ${receiptError.message}`);
  if (!completed) return { accepted: true, reconciled: false };

  let matches: Array<Record<string, unknown>> = [];
  for (const reference of candidates) {
    const { data: byJobReference, error: jobReferenceError } = await args.client.from("draft_jobs")
      .select("id, job_reference, external_order_id, commercial_total, payment_status")
      .eq("company_id", args.companyId)
      .eq("job_reference", reference)
      .limit(2);
    if (jobReferenceError) throw new Error(jobReferenceError.message);
    if (byJobReference?.length) { matches = byJobReference; break; }
    const { data: byExternalId, error: externalIdError } = await args.client.from("draft_jobs")
      .select("id, job_reference, external_order_id, commercial_total, payment_status")
      .eq("company_id", args.companyId)
      .eq("external_order_id", reference)
      .limit(2);
    if (externalIdError) throw new Error(externalIdError.message);
    if (byExternalId?.length) { matches = byExternalId; break; }
  }

  if (matches.length !== 1) {
    const reason = matches.length === 0 ? "No Nexus order matched the Square reference" : "Multiple Nexus orders matched the Square reference";
    await args.client.from("payment_events").update({ match_status: "mismatch", last_error: reason })
      .eq("company_id", args.companyId).eq("provider", "square").eq("provider_event_id", eventId);
    await args.client.from("reconciliation_exceptions").upsert({
      company_id: args.companyId, exception_key: `square-unmatched:${paymentId}`,
      exception_type: matches.length === 0 ? "payment_without_order" : "ambiguous_payment_match",
      severity: "urgent", source_system: "square", external_order_id: payment.order_id ?? null,
      details: { payment_id: paymentId, amount_minor: amountMinor, currency, references: candidates, note: payment.note ?? null },
      status: "open", last_detected_at: new Date().toISOString(),
    }, { onConflict: "company_id,exception_key" });
    return { accepted: true, reconciled: false, exception: reason };
  }

  const job = matches[0];
  const expectedAmount = currencyMinor(typeof job.commercial_total === "string" ? job.commercial_total : null);
  if (!expectedAmount || expectedAmount !== amountMinor || currency !== "gbp") {
    const reason = "Square payment amount or currency does not match the Nexus order";
    await args.client.from("payment_events").update({ match_status: "mismatch", draft_job_id: job.id, last_error: reason })
      .eq("company_id", args.companyId).eq("provider", "square").eq("provider_event_id", eventId);
    await args.client.from("reconciliation_exceptions").upsert({
      company_id: args.companyId, exception_key: `square-amount-mismatch:${paymentId}`,
      exception_type: "payment_amount_mismatch", severity: "critical", source_system: "square",
      draft_job_id: job.id, details: { payment_id: paymentId, expected_amount_minor: expectedAmount, received_amount_minor: amountMinor, currency },
      status: "open", last_detected_at: new Date().toISOString(),
    }, { onConflict: "company_id,exception_key" });
    return { accepted: true, reconciled: false, exception: reason };
  }

  const paidAt = payment.created_at || new Date().toISOString();
  const { error: jobError } = await args.client.from("draft_jobs").update({
    payment_status: "paid", payment_provider: "square", payment_provider_id: paymentId, paid_at: paidAt,
  }).eq("company_id", args.companyId).eq("id", job.id);
  if (jobError) throw new Error(jobError.message);
  const { error: outboxError } = await args.client.from("integration_outbox").upsert({
    company_id: args.companyId, draft_job_id: job.id, destination: "trackpod",
    operation: "release_paid_order", idempotency_key: `square-paid:${paymentId}`,
    payload: { square_payment_id: paymentId }, status: "pending",
  }, { onConflict: "destination,operation,idempotency_key", ignoreDuplicates: true });
  if (outboxError) throw new Error(outboxError.message);
  await args.client.from("payment_events").update({ match_status: "matched", draft_job_id: job.id, matched_at: new Date().toISOString(), last_error: null })
    .eq("company_id", args.companyId).eq("provider", "square").eq("provider_event_id", eventId);
  return { accepted: true, reconciled: true, draftJobId: job.id };
}
