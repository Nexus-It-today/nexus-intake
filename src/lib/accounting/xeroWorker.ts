import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentials } from "@/lib/integrations/credentials";
import { getConnectionRow } from "@/lib/integrations/service";
import { resolveAccountingProvider } from "@/lib/integrations/providerResolver";
import type { OutboxRow } from "@/lib/outbox/worker";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number.parseFloat(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pick(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = clean(source[key]);
    if (value) return value;
  }
  return "";
}

export async function dispatchXeroInvoice(client: SupabaseClient, outbox: OutboxRow) {
  const { data: job, error: jobError } = await client
    .from("draft_jobs")
    .select("id, company_id, job_reference, customer, delivery_company, delivery_email, requested_delivery_date, goods_description, commercial_net, commercial_vat, commercial_total, invoice_required, xero_draft_invoice_id, integration_metadata")
    .eq("id", outbox.draft_job_id)
    .eq("company_id", outbox.company_id)
    .single<Record<string, unknown>>();
  if (jobError || !job) throw new Error(jobError?.message ?? "Invoice job not found");
  if (job.invoice_required !== true) return { skipped: true, reason: "invoice_not_required" };
  if (clean(job.xero_draft_invoice_id)) return { skipped: true, reason: "already_created" };

  // The job's company is the legal entity. Never fall back to another entity's connection.
  const provider = await resolveAccountingProvider(client, outbox.company_id);
  if (!provider) throw new Error("No accounting connection configured for this legal entity");
  if (provider.providerKey !== "xero") throw new Error(`Configured accounting provider is ${provider.providerKey}, not Xero`);
  const connection = await getConnectionRow(client, outbox.company_id, "xero");
  if (!connection?.connected) throw new Error("Xero is not connected for this legal entity");

  const config = (connection.configuration ?? {}) as Record<string, unknown>;
  const credentials = decryptCredentials({
    ciphertext: clean(connection.credentials_ciphertext),
    iv: clean(connection.credentials_iv),
    tag: clean(connection.credentials_tag),
  });
  const accessToken = pick(credentials, "accessToken", "token", "xeroAccessToken");
  const tenantId = pick(credentials, "tenantId", "xeroTenantId") || pick(config, "tenantId", "xeroTenantId");
  if (!accessToken || !tenantId) throw new Error("Xero credentials are incomplete for this legal entity");

  const reference = clean(job.job_reference) || `NEX-${clean(job.id).slice(0, 8).toUpperCase()}`;
  const net = money(job.commercial_net);
  const vat = money(job.commercial_vat);
  const total = money(job.commercial_total);
  const lineAmount = net > 0 ? net : total > 0 ? total - vat : 0;
  if (lineAmount <= 0) throw new Error("Invoice amount is missing or zero");

  const invoice = {
    Type: "ACCREC", Status: "DRAFT", InvoiceNumber: reference, Reference: reference,
    Date: clean(job.requested_delivery_date) || new Date().toISOString().slice(0, 10),
    DueDate: clean(job.requested_delivery_date) || new Date().toISOString().slice(0, 10),
    Contact: {
      Name: clean(job.customer) || clean(job.delivery_company) || "NEXUS Customer",
      EmailAddress: clean(job.delivery_email) || undefined,
    },
    LineAmountTypes: "Exclusive",
    LineItems: [{
      Description: clean(job.goods_description) || `Delivery service ${reference}`,
      Quantity: 1, UnitAmount: lineAmount,
      AccountCode: pick(config, "salesAccount", "xeroSalesAccount") || "200",
      TaxType: pick(config, "vatCode", "xeroVatCode") || "OUTPUT2",
    }],
  };

  const baseUrl = pick(config, "baseUrl", "xeroBaseUrl") || "https://api.xero.com/api.xro/2.0";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/Invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": outbox.id,
    },
    body: JSON.stringify({ Invoices: [invoice] }),
  });
  const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Xero invoice create failed (${response.status})`);
  const invoices = Array.isArray(responseBody.Invoices) ? responseBody.Invoices : [];
  const created = (invoices[0] ?? {}) as Record<string, unknown>;
  const invoiceId = pick(created, "InvoiceID", "InvoiceNumber");
  if (!invoiceId) throw new Error("Xero response did not include an invoice id");

  const previous = (job.integration_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await client.from("draft_jobs").update({
    xero_draft_invoice_id: invoiceId,
    integration_metadata: {
      ...previous,
      accounting: { provider: "xero", legalEntityCompanyId: outbox.company_id, invoiceId, simulated: false, createdAt: new Date().toISOString() },
    },
  }).eq("id", outbox.draft_job_id).eq("company_id", outbox.company_id).is("xero_draft_invoice_id", null);
  if (updateError) throw new Error(updateError.message);
  return { skipped: false, invoiceId };
}
