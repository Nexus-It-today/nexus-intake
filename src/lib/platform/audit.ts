import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventParams = {
  actorUserId: string;
  organisationId?: string | null;
  merchantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  source?: string;
};

/**
 * Writes an immutable audit_events row. Callers must use the privileged
 * (service-role) client - audit_events has no INSERT policy for the
 * `authenticated` role, so this is the only supported write path from the
 * app. Failures are logged but never thrown: an audit-log write failure
 * must not block the underlying action it is recording.
 */
export async function recordAuditEvent(client: SupabaseClient, params: AuditEventParams): Promise<void> {
  const { error } = await client.from("audit_events").insert({
    actor_user_id: params.actorUserId,
    organisation_id: params.organisationId ?? null,
    merchant_id: params.merchantId ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
    source: params.source ?? "app",
  });

  if (error) {
    console.error("Failed to record audit event", {
      action: params.action,
      entityType: params.entityType,
      error,
    });
  }
}
