"use client";

import { useState } from "react";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FieldLabel,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  inputClassName,
} from "@/components/platform/ui";

type IntegrationRow = {
  provider_key: string;
  category: string;
  display_name: string;
  capabilities: string[];
  is_active: boolean;
  connection: {
    connected: boolean;
    credential_hint: string | null;
    connected_at: string | null;
    disconnected_at: string | null;
  } | null;
};

function ProviderCard({ provider, organisationId, canManage, onChanged }: {
  provider: IntegrationRow;
  organisationId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { accessToken } = usePlatform();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      // Simple "key=value" per line credential form - generic across every
      // provider, since no provider is hard-coded into this UI.
      const credentials: Record<string, string> = {};
      for (const line of fields.split("\n")) {
        const [key, ...rest] = line.split("=");
        if (key && key.trim() && rest.length > 0) {
          credentials[key.trim()] = rest.join("=").trim();
        }
      }
      if (Object.keys(credentials).length === 0) {
        setError("Enter at least one field as key=value.");
        setBusy(false);
        return;
      }
      await authedFetch(accessToken, `/api/platform/organisations/${organisationId}/integrations`, {
        method: "POST",
        body: JSON.stringify({ providerKey: provider.provider_key, credentials }),
      });
      setFields("");
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(accessToken, `/api/platform/organisations/${organisationId}/integrations?providerKey=${provider.provider_key}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(provider.connection?.connected);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{provider.display_name}</p>
          <p className="text-xs uppercase tracking-wide text-slate-400">{provider.category}</p>
        </div>
        <Badge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Not connected"}</Badge>
      </div>

      {connected ? (
        <p className="mt-3 text-sm text-slate-600">
          Stored credentials: <span className="font-medium text-slate-800">{provider.connection?.credential_hint}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No credentials configured for this organisation.</p>
      )}

      {canManage ? (
        <div className="mt-4 flex flex-col gap-2">
          {editing ? (
            <>
              <FieldLabel>Credential fields (one per line, key=value - never shown again after saving)</FieldLabel>
              <textarea
                className={`${inputClassName} h-24 font-mono text-xs`}
                value={fields}
                onChange={(event) => setFields(event.target.value)}
                placeholder={"apiKey=...\napiSecret=..."}
              />
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex gap-2">
                <PrimaryButton onClick={onSave} disabled={busy}>
                  {busy ? "Saving..." : "Save credentials"}
                </PrimaryButton>
                <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setEditing(true)}>{connected ? "Replace credentials" : "Connect"}</SecondaryButton>
              {connected ? (
                <SecondaryButton onClick={onDisconnect} disabled={busy}>
                  Disconnect
                </SecondaryButton>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export default function IntegrateItPage() {
  const { activeContext, previewReadOnly } = usePlatform();
  const organisationId = activeContext?.type === "organisation" ? activeContext.id : activeContext?.type === "merchant" ? activeContext.organisationId : null;

  const { data, loading, error, reload } = useAuthedResource<{ integrations: IntegrationRow[]; canManage: boolean }>(
    organisationId ? `/api/platform/organisations/${organisationId}/integrations` : null
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Integrate it"
        description="Organisation-scoped integration credentials. Credentials are encrypted at rest and never shown again after saving - only which fields are configured."
      />

      {!organisationId ? (
        <EmptyState title="Switch to an organisation" description="Use the Working as switcher to manage integrations for a specific organisation." />
      ) : loading ? (
        <LoadingState label="Loading integrations..." />
      ) : error ? (
        <ErrorState description={error} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(data?.integrations ?? []).map((provider) => (
            <ProviderCard
              key={provider.provider_key}
              provider={provider}
              organisationId={organisationId}
              canManage={Boolean(data?.canManage) && !previewReadOnly}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
