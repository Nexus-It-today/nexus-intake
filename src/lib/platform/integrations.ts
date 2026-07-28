import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentials } from "@/lib/integrations/credentials";

export type IntegrationProviderRow = {
  provider_key: string;
  category: string;
  display_name: string;
  capabilities: string[];
  sort_order: number;
  is_active: boolean;
};

export type OrganisationConnectionRow = {
  id: string;
  organisation_id: string;
  provider_key: string;
  connected: boolean;
  credential_hint: string | null;
  configuration: Record<string, unknown>;
  connected_at: string | null;
  disconnected_at: string | null;
  last_tested_at: string | null;
  last_error: string | null;
};

/** Never selects credentials_ciphertext/iv/tag - those must never leave the server. */
const SAFE_CONNECTION_COLUMNS =
  "id, organisation_id, provider_key, connected, credential_hint, configuration, connected_at, disconnected_at, last_tested_at, last_error";

export async function fetchIntegrationProviders(client: SupabaseClient): Promise<IntegrationProviderRow[]> {
  const { data, error } = await client
    .from("integration_providers")
    .select("provider_key, category, display_name, capabilities, sort_order, is_active")
    .order("sort_order");
  if (error) {
    console.error("Failed to fetch integration providers", { error });
    return [];
  }
  return (data as IntegrationProviderRow[] | null) ?? [];
}

export async function fetchOrganisationConnections(
  client: SupabaseClient,
  organisationId: string
): Promise<OrganisationConnectionRow[]> {
  const { data, error } = await client
    .from("organisation_integration_connections")
    .select(SAFE_CONNECTION_COLUMNS)
    .eq("organisation_id", organisationId);
  if (error) {
    console.error("Failed to fetch organisation integration connections", { organisationId, error });
    return [];
  }
  return (data as OrganisationConnectionRow[] | null) ?? [];
}

function buildCredentialHint(credentials: Record<string, unknown>): string {
  const fields = Object.keys(credentials).filter((key) => credentials[key] !== undefined && credentials[key] !== "");
  if (fields.length === 0) return "No fields set";
  return `${fields.join(", ")} configured`;
}

export async function upsertOrganisationConnection(
  client: SupabaseClient,
  params: {
    organisationId: string;
    providerKey: string;
    credentials: Record<string, unknown>;
    actorUserId: string;
  }
): Promise<{ ok: true; row: OrganisationConnectionRow } | { ok: false; error: string }> {
  const encrypted = encryptCredentials(params.credentials);
  const credentialHint = buildCredentialHint(params.credentials);

  const { data, error } = await client
    .from("organisation_integration_connections")
    .upsert(
      {
        organisation_id: params.organisationId,
        provider_key: params.providerKey,
        connected: true,
        credentials_ciphertext: encrypted.ciphertext,
        credentials_iv: encrypted.iv,
        credentials_tag: encrypted.tag,
        credential_hint: credentialHint,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        created_by: params.actorUserId,
      },
      { onConflict: "organisation_id,provider_key" }
    )
    .select(SAFE_CONNECTION_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to save integration credentials." };
  }
  return { ok: true, row: data as OrganisationConnectionRow };
}

export async function disconnectOrganisationConnection(
  client: SupabaseClient,
  organisationId: string,
  providerKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("organisation_integration_connections")
    .update({
      connected: false,
      disconnected_at: new Date().toISOString(),
      credentials_ciphertext: null,
      credentials_iv: null,
      credentials_tag: null,
      credential_hint: null,
    })
    .eq("organisation_id", organisationId)
    .eq("provider_key", providerKey);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
