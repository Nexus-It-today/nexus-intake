"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";
import { BRANDING_ASSET_TYPES, type BrandingAssetType, type BrandingProfileRow, type BrandingAssetRow } from "@/lib/platform/branding";
import { Card, EmptyState, ErrorState, FieldLabel, LoadingState, PageHeader, PrimaryButton, SecondaryButton, inputClassName } from "@/components/platform/ui";

type BrandingScope = "platform" | "organisation" | "merchant";

type ProfileResponse = { profile: BrandingProfileRow | null; assets: BrandingAssetRow[]; canManage: boolean };

const ASSET_LABELS: Record<BrandingAssetType, string> = {
  primary_logo: "Primary logo",
  compact_logo: "Square / compact logo",
  favicon: "Favicon",
  logo_light_bg: "Logo for light backgrounds",
  logo_dark_bg: "Logo for dark backgrounds",
  invoice_logo: "Invoice / document logo",
  email_header_logo: "Email header logo",
};

const ASSET_GUIDANCE: Record<BrandingAssetType, string> = {
  primary_logo: "Recommended: transparent PNG or SVG, roughly 400x100px.",
  compact_logo: "Recommended: square PNG or SVG, at least 256x256px.",
  favicon: "Recommended: square PNG, 32x32px or 64x64px.",
  logo_light_bg: "Recommended: dark logo for use on white/light surfaces.",
  logo_dark_bg: "Recommended: light logo for use on navy/dark surfaces.",
  invoice_logo: "Recommended: PNG, at least 300px wide, no transparency needed.",
  email_header_logo: "Recommended: PNG, roughly 600x150px for email clients.",
};

function useScopeFromQuery(): { scope: BrandingScope; scopeId: string | null } {
  const searchParams = useSearchParams();
  const { activeContext } = usePlatform();
  const queryScope = searchParams.get("scope") as BrandingScope | null;
  const queryScopeId = searchParams.get("scopeId");

  if (queryScope === "platform") return { scope: "platform", scopeId: null };
  if ((queryScope === "organisation" || queryScope === "merchant") && queryScopeId) {
    return { scope: queryScope, scopeId: queryScopeId };
  }

  if (activeContext?.type === "organisation") return { scope: "organisation", scopeId: activeContext.id };
  if (activeContext?.type === "merchant") return { scope: "merchant", scopeId: activeContext.id };
  return { scope: "platform", scopeId: null };
}

function AssetRow({
  assetType,
  asset,
  canManage,
  scope,
  scopeId,
  onChanged,
}: {
  assetType: BrandingAssetType;
  asset: BrandingAssetRow | undefined;
  canManage: boolean;
  scope: BrandingScope;
  scopeId: string | null;
  onChanged: () => void;
}) {
  const { accessToken } = usePlatform();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    const params = new URLSearchParams();
    if (scope === "organisation") params.set("organisationId", scopeId ?? "");
    if (scope === "merchant") params.set("merchantId", scopeId ?? "");
    fetch(`/api/platform/branding?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: { branding?: { assets?: Partial<Record<BrandingAssetType, { url: string }>> } }) => {
        setPreviewUrl(payload.branding?.assets?.[assetType]?.url ?? null);
      })
      .catch(() => setPreviewUrl(null));
  }, [asset, assetType, scope, scopeId]);

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("scope", scope);
      if (scopeId) formData.append("scopeId", scopeId);
      formData.append("assetType", assetType);
      formData.append("file", file);
      await authedFetch(accessToken, "/api/platform/branding/assets", { method: "POST", body: formData });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreInherited() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope, assetType });
      if (scopeId) params.set("scopeId", scopeId);
      await authedFetch(accessToken, `/api/platform/branding/assets?${params.toString()}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore inherited branding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={ASSET_LABELS[assetType]} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-400">No asset</span>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{ASSET_LABELS[assetType]}</p>
          <p className="text-xs text-slate-400">{asset ? "Set for this level" : "Inherited"}</p>
          <p className="text-xs text-slate-400">{ASSET_GUIDANCE[assetType]}</p>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
      </div>

      {canManage ? (
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(file);
              event.target.value = "";
            }}
          />
          <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {asset ? "Replace" : "Upload"}
          </SecondaryButton>
          {asset ? (
            <SecondaryButton onClick={onRestoreInherited} disabled={busy}>
              Restore inherited
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function BrandItPage() {
  const { scope, scopeId } = useScopeFromQuery();
  const { accessToken } = usePlatform();
  const url = `/api/platform/branding/profile?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ""}`;
  const { data, loading, error, reload } = useAuthedResource<ProfileResponse>(url);

  const [form, setForm] = useState({
    displayName: "",
    primaryColour: "",
    accentColour: "",
    supportEmail: "",
    supportPhone: "",
    websiteUrl: "",
    poweredByVisible: true,
    allowMerchantBranding: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        displayName: data.profile.display_name ?? "",
        primaryColour: data.profile.primary_colour ?? "",
        accentColour: data.profile.accent_colour ?? "",
        supportEmail: data.profile.support_email ?? "",
        supportPhone: data.profile.support_phone ?? "",
        websiteUrl: data.profile.website_url ?? "",
        poweredByVisible: data.profile.powered_by_visible,
        allowMerchantBranding: data.profile.allow_merchant_branding,
      });
    }
  }, [data]);

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await authedFetch(accessToken, url, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save branding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading branding..." />;
  if (error) return <ErrorState description={error} />;

  const canManage = Boolean(data?.canManage);
  const assetsByType = new Map((data?.assets ?? []).map((asset) => [asset.asset_type, asset]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand it"
        title={scope === "platform" ? "Nexus it platform branding" : scope === "organisation" ? "Organisation branding" : "Merchant branding"}
        description="Branding inherits merchant -> organisation -> Nexus it default. Overrides here apply everywhere this scope's branding is shown: the app header, hosted booking forms, tracking pages, emails, invoices and embeds."
      />

      {!canManage ? (
        <EmptyState title="Read-only" description="You do not have permission to edit branding at this level." />
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Display name</FieldLabel>
            <input
              className={inputClassName}
              value={form.displayName}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Website URL</FieldLabel>
            <input
              className={inputClassName}
              value={form.websiteUrl}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Primary colour</FieldLabel>
            <input
              className={inputClassName}
              value={form.primaryColour}
              disabled={!canManage}
              placeholder="#0F172A"
              onChange={(event) => setForm((prev) => ({ ...prev, primaryColour: event.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Accent colour</FieldLabel>
            <input
              className={inputClassName}
              value={form.accentColour}
              disabled={!canManage}
              placeholder="#2563EB"
              onChange={(event) => setForm((prev) => ({ ...prev, accentColour: event.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Support email</FieldLabel>
            <input
              className={inputClassName}
              value={form.supportEmail}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, supportEmail: event.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Support telephone</FieldLabel>
            <input
              className={inputClassName}
              value={form.supportPhone}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, supportPhone: event.target.value }))}
            />
          </div>
        </div>

        {scope === "platform" ? (
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.poweredByVisible}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, poweredByVisible: event.target.checked }))}
            />
            Show &ldquo;Powered by Nexus it&rdquo; on hosted experiences
          </label>
        ) : null}

        {scope === "organisation" ? (
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.allowMerchantBranding}
              disabled={!canManage}
              onChange={(event) => setForm((prev) => ({ ...prev, allowMerchantBranding: event.target.checked }))}
            />
            Allow merchants under this organisation to set their own branding
          </label>
        ) : null}

        {saveError ? <p className="mt-3 text-sm text-rose-600">{saveError}</p> : null}

        {canManage ? (
          <div className="mt-4">
            <PrimaryButton onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save branding details"}
            </PrimaryButton>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Logos and images</h2>
        <div className="mt-2">
          {BRANDING_ASSET_TYPES.map((assetType) => (
            <AssetRow
              key={assetType}
              assetType={assetType}
              asset={assetsByType.get(assetType)}
              canManage={canManage}
              scope={scope}
              scopeId={scopeId}
              onChanged={reload}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
