import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessProfile } from "./types";

export type BrandingScope = "platform" | "organisation" | "merchant";

export type BrandingAssetType =
  | "primary_logo"
  | "compact_logo"
  | "favicon"
  | "logo_light_bg"
  | "logo_dark_bg"
  | "invoice_logo"
  | "email_header_logo";

export const BRANDING_ASSET_TYPES: BrandingAssetType[] = [
  "primary_logo",
  "compact_logo",
  "favicon",
  "logo_light_bg",
  "logo_dark_bg",
  "invoice_logo",
  "email_header_logo",
];

export const BRANDING_ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const BRANDING_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const BRANDING_BUCKET = "branding-assets";

export type BrandingProfileRow = {
  id: string;
  scope: BrandingScope;
  scope_id: string | null;
  display_name: string | null;
  primary_colour: string | null;
  accent_colour: string | null;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  powered_by_visible: boolean;
  allow_merchant_branding: boolean;
};

export type BrandingAssetRow = {
  id: string;
  branding_profile_id: string;
  asset_type: BrandingAssetType;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
};

type ResolvedTextField = "displayName" | "primaryColour" | "accentColour" | "supportEmail" | "supportPhone" | "websiteUrl";

export type ResolvedBranding = {
  displayName: string | null;
  primaryColour: string | null;
  accentColour: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  poweredByVisible: boolean;
  assets: Partial<Record<BrandingAssetType, { url: string; storagePath: string }>>;
  sources: Partial<Record<ResolvedTextField, BrandingScope>>;
};

export function brandingAssetPublicUrl(client: SupabaseClient, storagePath: string): string {
  const { data } = client.storage.from(BRANDING_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export function brandingStoragePath(scope: BrandingScope, scopeId: string | null, assetType: BrandingAssetType, extension: string): string {
  const scopeSegment = scope === "platform" ? "global" : scopeId;
  return `${scope}/${scopeSegment}/${assetType}.${extension}`;
}

export async function fetchBrandingProfile(
  client: SupabaseClient,
  scope: BrandingScope,
  scopeId: string | null
): Promise<BrandingProfileRow | null> {
  let query = client.from("branding_profiles").select("*").eq("scope", scope);
  query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Failed to fetch branding profile", { scope, scopeId, error });
    return null;
  }
  return (data as BrandingProfileRow | null) ?? null;
}

export async function fetchBrandingAssets(client: SupabaseClient, brandingProfileId: string): Promise<BrandingAssetRow[]> {
  const { data, error } = await client
    .from("branding_assets")
    .select("*")
    .eq("branding_profile_id", brandingProfileId);
  if (error) {
    console.error("Failed to fetch branding assets", { brandingProfileId, error });
    return [];
  }
  return (data as BrandingAssetRow[] | null) ?? [];
}

export async function ensureBrandingProfile(
  client: SupabaseClient,
  scope: BrandingScope,
  scopeId: string | null
): Promise<BrandingProfileRow> {
  const existing = await fetchBrandingProfile(client, scope, scopeId);
  if (existing) return existing;

  const { data, error } = await client
    .from("branding_profiles")
    .insert({ scope, scope_id: scopeId })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create branding profile");
  }

  return data as BrandingProfileRow;
}

/**
 * Resolves branding with inheritance: merchant -> organisation -> platform
 * default. Every field and every asset type is resolved independently, so a
 * tenant can override just its accent colour while still inheriting the
 * platform's default logo, or vice versa.
 */
export async function resolveBranding(
  client: SupabaseClient,
  target: { merchantId?: string | null; organisationId?: string | null }
): Promise<ResolvedBranding> {
  const layers: { scope: BrandingScope; scopeId: string | null }[] = [];
  if (target.merchantId) layers.push({ scope: "merchant", scopeId: target.merchantId });
  if (target.organisationId) layers.push({ scope: "organisation", scopeId: target.organisationId });
  layers.push({ scope: "platform", scopeId: null });

  const resolved: ResolvedBranding = {
    displayName: null,
    primaryColour: null,
    accentColour: null,
    supportEmail: null,
    supportPhone: null,
    websiteUrl: null,
    poweredByVisible: true,
    assets: {},
    sources: {},
  };

  const textFieldMap: Array<[ResolvedTextField, keyof BrandingProfileRow]> = [
    ["displayName", "display_name"],
    ["primaryColour", "primary_colour"],
    ["accentColour", "accent_colour"],
    ["supportEmail", "support_email"],
    ["supportPhone", "support_phone"],
    ["websiteUrl", "website_url"],
  ];

  for (const layer of layers) {
    const profile = await fetchBrandingProfile(client, layer.scope, layer.scopeId);
    if (!profile) continue;

    for (const [resolvedKey, columnKey] of textFieldMap) {
      const value = profile[columnKey];
      if (resolved[resolvedKey] === null && typeof value === "string" && value.length > 0) {
        resolved[resolvedKey] = value;
        resolved.sources[resolvedKey] = layer.scope;
      }
    }

    if (layer.scope === "platform") {
      resolved.poweredByVisible = profile.powered_by_visible;
    }

    const assets = await fetchBrandingAssets(client, profile.id);
    for (const asset of assets) {
      if (!resolved.assets[asset.asset_type]) {
        resolved.assets[asset.asset_type] = {
          url: brandingAssetPublicUrl(client, asset.storage_path),
          storagePath: asset.storage_path,
        };
      }
    }
  }

  return resolved;
}

/**
 * Application-level mirror of the can_manage_branding() Postgres function
 * (supabase/migrations/20260727093000_foundation_branding.sql). Used by API
 * routes that write through the privileged/service-role client, which
 * bypasses RLS, so this check is the enforcement point on that path.
 */
export async function canManageBrandingForScope(
  client: SupabaseClient,
  profile: AccessProfile,
  scope: BrandingScope,
  scopeId: string | null
): Promise<boolean> {
  if (scope === "platform") {
    return profile.isPlatformAdmin;
  }

  if (scope === "organisation" && scopeId) {
    return (
      profile.isPlatformAdmin ||
      profile.organisations.some(
        (org) => org.id === scopeId && ["organisation_owner", "organisation_admin"].includes(org.role)
      )
    );
  }

  if (scope === "merchant" && scopeId) {
    const { data: merchant } = await client.from("merchants").select("company_id").eq("id", scopeId).maybeSingle();
    if (!merchant) return false;

    const canManage =
      profile.isPlatformAdmin ||
      profile.merchants.some((m) => m.id === scopeId && ["merchant_owner", "merchant_admin"].includes(m.role)) ||
      profile.organisations.some(
        (org) => org.id === merchant.company_id && ["organisation_owner", "organisation_admin"].includes(org.role)
      );
    if (!canManage) return false;

    const parentBranding = await fetchBrandingProfile(client, "organisation", merchant.company_id);
    return parentBranding?.allow_merchant_branding ?? true;
  }

  return false;
}
