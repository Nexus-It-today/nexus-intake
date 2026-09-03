import Stripe from "stripe";
import { decryptCredentials } from "@/lib/integrations/credentials";
import { getConnectionRow } from "@/lib/integrations/service";
import type { SupabaseClient } from "@supabase/supabase-js";

type StripeSecrets = { secretKey: string; webhookSecret: string };

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function getStripeForCompany(
  client: SupabaseClient,
  companyId: string
): Promise<{ stripe: Stripe; secrets: StripeSecrets }> {
  const row = await getConnectionRow(client, companyId, "stripe");
  if (!row?.connected) throw new Error("Stripe is not connected for this legal entity");
  if (!row.credentials_ciphertext || !row.credentials_iv || !row.credentials_tag) {
    throw new Error("Stripe credentials are missing for this legal entity");
  }

  const credentials = decryptCredentials({
    ciphertext: String(row.credentials_ciphertext),
    iv: String(row.credentials_iv),
    tag: String(row.credentials_tag),
  });
  const secretKey = firstString(credentials, ["restrictedKey", "secretKey", "apiKey", "stripeSecretKey"]);
  const webhookSecret = firstString(credentials, ["webhookSecret", "stripeWebhookSecret"]);
  if (!secretKey) throw new Error("Stripe restricted key is not configured");

  return {
    stripe: new Stripe(secretKey),
    secrets: { secretKey, webhookSecret },
  };
}

export function currencyMinor(value: string | null): number {
  const parsed = Number.parseFloat((value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function paymentMetadata(args: {
  companyId: string;
  draftJobId: string;
  paymentRequestId: string;
  bookingReference: string;
}): Record<string, string> {
  return {
    nexus_company_id: args.companyId,
    nexus_draft_job_id: args.draftJobId,
    nexus_payment_request_id: args.paymentRequestId,
    nexus_booking_reference: args.bookingReference,
  };
}
