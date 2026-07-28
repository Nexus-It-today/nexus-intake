"use client";

import { useEffect, useState } from "react";

type BrandingAssets = { primary_logo?: { url: string }; compact_logo?: { url: string } };
type ResolvedBrandingLite = { displayName: string | null; assets: BrandingAssets };

/**
 * Renders the active tenant's logo with inheritance already resolved by
 * /api/platform/branding (merchant -> organisation -> platform). Falls back
 * to a clean "Nexus it" wordmark - never a broken <img> tag and never a
 * generated letter-avatar - per the Sprint 1 visual direction.
 */
export default function NexusLogo({
  organisationId,
  merchantId,
  compact = false,
  className = "",
}: {
  organisationId?: string | null;
  merchantId?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [branding, setBranding] = useState<ResolvedBrandingLite | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (organisationId) params.set("organisationId", organisationId);
    if (merchantId) params.set("merchantId", merchantId);

    fetch(`/api/platform/branding?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: { branding?: ResolvedBrandingLite }) => {
        if (!cancelled) setBranding(payload.branding ?? null);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      });

    return () => {
      cancelled = true;
    };
  }, [organisationId, merchantId]);

  const logoUrl = compact ? branding?.assets.compact_logo?.url ?? branding?.assets.primary_logo?.url : branding?.assets.primary_logo?.url;

  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={branding?.displayName ?? "Nexus it"} className={`h-8 w-auto ${className}`} />;
  }

  return (
    <span className={`text-lg font-bold tracking-tight text-slate-900 ${className}`}>
      Nexus <span className="text-blue-600">it</span>
    </span>
  );
}
