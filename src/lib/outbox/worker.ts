import type { SupabaseClient } from "@supabase/supabase-js";

export type OutboxRow = {
  id: string;
  company_id: string;
  draft_job_id: string;
  destination: string;
  operation: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

const MAX_ATTEMPTS = 8;

export async function claimOutbox(client: SupabaseClient, destination: string, batchSize = 10): Promise<OutboxRow[]> {
  const { data, error } = await client.rpc("claim_integration_outbox", {
    worker_destination: destination,
    batch_size: batchSize,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as OutboxRow[];
}

export async function deliverOutbox(client: SupabaseClient, id: string) {
  const { error } = await client
    .from("integration_outbox")
    .update({ status: "delivered", delivered_at: new Date().toISOString(), locked_at: null, last_error: null })
    .eq("id", id)
    .eq("status", "processing");
  if (error) throw new Error(error.message);
}

export async function failOutbox(client: SupabaseClient, row: OutboxRow, message: string) {
  const dead = row.attempt_count >= MAX_ATTEMPTS;
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, row.attempt_count - 1)));
  const { error } = await client
    .from("integration_outbox")
    .update({
      status: dead ? "dead_letter" : "retry",
      available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      locked_at: null,
      last_error: message.slice(0, 4000),
    })
    .eq("id", row.id)
    .eq("status", "processing");
  if (error) throw new Error(error.message);

  if (dead) {
    await client.from("reconciliation_exceptions").upsert({
      company_id: row.company_id,
      exception_key: `outbox-dead-letter:${row.id}`,
      exception_type: "integration_delivery_failed",
      severity: "critical",
      source_system: row.destination,
      draft_job_id: row.draft_job_id,
      details: { operation: row.operation, attempts: row.attempt_count, error: message.slice(0, 1000) },
      status: "open",
      last_detected_at: new Date().toISOString(),
    }, { onConflict: "company_id,exception_key" });
  }
}
