"use client";

import { useMemo, useState } from "react";
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
  Table,
  Td,
  Th,
  inputClassName,
} from "@/components/platform/ui";

type Entitlement = {
  moduleKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  source: "platform_default" | "manual_grant";
  usageLimit: number | null;
  notes: string | null;
};

function EntitlementRow({
  entry,
  canManage,
  onSave,
}: {
  entry: Entitlement;
  canManage: boolean;
  onSave: (moduleKey: string, enabled: boolean, usageLimit: number | null) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(entry.enabled);
  const [usageLimit, setUsageLimit] = useState(entry.usageLimit?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(entry.moduleKey, enabled, usageLimit.trim() ? Number(usageLimit) : null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <Td className="font-medium text-slate-900">
        {entry.name}
        {entry.description ? <p className="text-xs font-normal text-slate-400">{entry.description}</p> : null}
      </Td>
      <Td>
        {canManage ? (
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        ) : (
          <Badge tone={entry.enabled ? "success" : "neutral"}>{entry.enabled ? "Enabled" : "Disabled"}</Badge>
        )}
      </Td>
      <Td>
        <Badge tone={entry.source === "manual_grant" ? "info" : "neutral"}>{entry.source === "manual_grant" ? "Manual grant" : "Platform default"}</Badge>
      </Td>
      <Td>
        {canManage ? (
          <input
            type="number"
            className={`${inputClassName} w-24`}
            value={usageLimit}
            onChange={(event) => setUsageLimit(event.target.value)}
            placeholder="Unlimited"
          />
        ) : (
          entry.usageLimit ?? "Unlimited"
        )}
      </Td>
      {canManage ? (
        <Td>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </PrimaryButton>
        </Td>
      ) : null}
    </tr>
  );
}

export default function CommercialItPage() {
  const { accessToken, profile, activeContext } = usePlatform();

  const defaultOrgId =
    activeContext?.type === "organisation" ? activeContext.id : activeContext?.type === "merchant" ? activeContext.organisationId : profile?.organisations[0]?.id ?? "";
  const [selectedOrgId, setSelectedOrgId] = useState(defaultOrgId);
  const organisationId = selectedOrgId || defaultOrgId;

  const { data, loading, error, reload } = useAuthedResource<{ entitlements: Entitlement[]; canManage: boolean }>(
    organisationId ? `/api/platform/organisations/${organisationId}/modules` : null
  );

  const merchantId = activeContext?.type === "merchant" ? activeContext.id : null;
  const { data: merchantData, reload: reloadMerchant } = useAuthedResource<{ entitlements: Entitlement[]; canManage: boolean }>(
    merchantId ? `/api/platform/merchants/${merchantId}/modules` : null
  );

  const organisationOptions = useMemo(() => profile?.organisations ?? [], [profile]);

  async function onSaveOrganisationEntitlement(moduleKey: string, enabled: boolean, usageLimit: number | null) {
    await authedFetch(accessToken, `/api/platform/organisations/${organisationId}/modules`, {
      method: "PATCH",
      body: JSON.stringify({ moduleKey, enabled, usageLimit }),
    });
    await reload();
  }

  async function onSaveMerchantEntitlement(moduleKey: string, enabled: boolean, usageLimit: number | null) {
    if (!merchantId) return;
    await authedFetch(accessToken, `/api/platform/merchants/${merchantId}/modules`, {
      method: "PATCH",
      body: JSON.stringify({ moduleKey, enabled, usageLimit }),
    });
    await reloadMerchant();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Commercial rules"
        description="Module entitlements per organisation, and per merchant where supported. Usage limits are recorded as an allowance only - no billing is implemented yet."
      />

      {profile?.isPlatformAdmin && organisationOptions.length > 0 ? (
        <Card>
          <FieldLabel>Viewing organisation</FieldLabel>
          <select className={inputClassName} value={organisationId} onChange={(event) => setSelectedOrgId(event.target.value)}>
            {organisationOptions.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Card>
      ) : null}

      {!organisationId ? (
        <EmptyState title="Switch to an organisation" description="Use the Working as switcher, or select an organisation above." />
      ) : loading ? (
        <LoadingState label="Loading entitlements..." />
      ) : error ? (
        <ErrorState description={error} />
      ) : (
        <Card className="p-0">
          <div className="p-4">
            <h2 className="text-base font-semibold text-slate-900">Organisation modules</h2>
            {!data?.canManage ? <p className="mt-1 text-xs text-slate-400">Read-only - only Nexus platform admins change organisation entitlements.</p> : null}
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Module</Th>
                <Th>Enabled</Th>
                <Th>Source</Th>
                <Th>Usage limit</Th>
                {data?.canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.entitlements ?? []).map((entry) => (
                <EntitlementRow key={entry.moduleKey} entry={entry} canManage={Boolean(data?.canManage)} onSave={onSaveOrganisationEntitlement} />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {merchantId ? (
        <Card className="p-0">
          <div className="p-4">
            <h2 className="text-base font-semibold text-slate-900">Merchant modules</h2>
            <p className="mt-1 text-xs text-slate-400">
              A merchant can never exceed what its organisation has been granted, even if enabled here.
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Module</Th>
                <Th>Enabled</Th>
                <Th>Source</Th>
                <Th>Usage limit</Th>
                {merchantData?.canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(merchantData?.entitlements ?? []).map((entry) => (
                <EntitlementRow key={entry.moduleKey} entry={entry} canManage={Boolean(merchantData?.canManage)} onSave={onSaveMerchantEntitlement} />
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
