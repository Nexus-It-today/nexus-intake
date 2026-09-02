import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DurableReceiptInput = {
  companyId: string;
  sourceSystem: string;
  eventType: string;
  externalEventId: string;
  externalOrderId?: string | null;
  payload: unknown;
};

export function payloadHash(rawPayload: string): string {
  return createHash("sha256").update(rawPayload, "utf8").digest("hex");
}

export async function persistReceipt(
  client: SupabaseClient,
  input: DurableReceiptInput,
  rawPayload: string,
): Promise<{ id: string; duplicate: boolean; draftJobId: string | null; status: string }> {
  const row = {
    company_id: input.companyId,
    source_system: input.sourceSystem,
    event_type: input.eventType,
    external_event_id: input.externalEventId,
    external_order_id: input.externalOrderId || null,
    payload: input.payload,
    payload_sha256: payloadHash(rawPayload),
  };

  const { data: inserted, error } = await client
    .from("order_ingestion_events")
    .insert(row)
    .select("id, draft_job_id, processing_status")
    .maybeSingle();

  if (!error && inserted) {
    return {
      id: String(inserted.id),
      duplicate: false,
      draftJobId: typeof inserted.draft_job_id === "string" ? inserted.draft_job_id : null,
      status: String(inserted.processing_status),
    };
  }

  if (error?.code !== "23505") {
    throw new Error(`Unable to retain intake event: ${error?.message ?? "insert failed"}`);
  }

  const { data: existing, error: lookupError } = await client
    .from("order_ingestion_events")
    .select("id, draft_job_id, processing_status, payload_sha256")
    .eq("company_id", input.companyId)
    .eq("source_system", input.sourceSystem)
    .eq("external_event_id", input.externalEventId)
    .single();

  if (lookupError || !existing) {
    throw new Error(`Unable to recover duplicate intake event: ${lookupError?.message ?? "not found"}`);
  }
  if (existing.payload_sha256 !== row.payload_sha256) {
    throw new Error("Intake event identity was reused with a different payload");
  }

  return {
    id: String(existing.id),
    duplicate: true,
    draftJobId: typeof existing.draft_job_id === "string" ? existing.draft_job_id : null,
    status: String(existing.processing_status),
  };
}

export async function markReceiptProcessing(client: SupabaseClient, receiptId: string) {
  const { error } = await client
    .from("order_ingestion_events")
    .update({
      processing_status: "processing",
      processing_attempts: 1,
      last_error: null,
    })
    .eq("id", receiptId);
  if (error) throw new Error(error.message);
}

export async function markReceiptProcessed(
  client: SupabaseClient,
  receiptId: string,
  companyId: string,
  jobId: string,
  idempotencyKey: string,
) {
  const now = new Date().toISOString();
  // Commit the durable delivery instruction before marking receipt processing
  // complete. A retry can safely upsert the same idempotency key.
  const { error: outboxError } = await client.from("integration_outbox").upsert(
    {
      company_id: companyId,
      draft_job_id: jobId,
      destination: "trackpod",
      operation: "create_order",
      idempotency_key: idempotencyKey,
      payload: { draftJobId: jobId },
      status: "pending",
      available_at: now,
    },
    { onConflict: "destination,operation,idempotency_key", ignoreDuplicates: true },
  );
  if (outboxError) throw new Error(outboxError.message);

  const { error: receiptError } = await client
    .from("order_ingestion_events")
    .update({ processing_status: "processed", draft_job_id: jobId, processed_at: now, last_error: null })
    .eq("id", receiptId);
  if (receiptError) throw new Error(receiptError.message);
}

export async function markReceiptFailed(client: SupabaseClient, receiptId: string, message: string) {
  await client
    .from("order_ingestion_events")
    .update({ processing_status: "failed", last_error: message.slice(0, 4000) })
    .eq("id", receiptId);
}
