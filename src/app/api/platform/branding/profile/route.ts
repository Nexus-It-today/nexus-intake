import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import {
  canManageBrandingForScope,
  ensureBrandingProfile,
  fetchBrandingAssets,
  fetchBrandingProfile,
  type BrandingScope,
} from "@/lib/platform/branding";

function parseScope(request: NextRequest): { scope: BrandingScope; scopeId: string | null } | null {
  const scope = request.nextUrl.searchParams.get("scope") as BrandingScope | null;
  const scopeId = request.nextUrl.searchParams.get("scopeId");
  if (scope === "platform") return { scope, scopeId: null };
  if ((scope === "organisation" || scope === "merchant") && scopeId) return { scope, scopeId };
  return null;
}

export async function GET(request: NextRequest) {
  const target = parseScope(request);
  if (!target) {
    return NextResponse.json({ error: "A valid scope (and scopeId for organisation/merchant) is required." }, { status: 400 });
  }

  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const profile = await fetchBrandingProfile(privilegedClient, target.scope, target.scopeId);
  const assets = profile ? await fetchBrandingAssets(privilegedClient, profile.id) : [];
  const canManage = await canManageBrandingForScope(privilegedClient, result.value, target.scope, target.scopeId);

  if (!canManage && target.scope === "platform") {
    return NextResponse.json({ error: "Only Nexus platform admins can view platform branding settings." }, { status: 403 });
  }

  return NextResponse.json({ profile, assets, canManage });
}

export async function PATCH(request: NextRequest) {
  const target = parseScope(request);
  if (!target) {
    return NextResponse.json({ error: "A valid scope (and scopeId for organisation/merchant) is required." }, { status: 400 });
  }

  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const canManage = await canManageBrandingForScope(privilegedClient, result.value, target.scope, target.scopeId);
  if (!canManage) {
    return NextResponse.json({ error: "You do not have permission to manage this branding profile." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string | null;
    primaryColour?: string | null;
    accentColour?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
    websiteUrl?: string | null;
    poweredByVisible?: boolean;
    allowMerchantBranding?: boolean;
  };

  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) updates.display_name = body.displayName;
  if (body.primaryColour !== undefined) updates.primary_colour = body.primaryColour;
  if (body.accentColour !== undefined) updates.accent_colour = body.accentColour;
  if (body.supportEmail !== undefined) updates.support_email = body.supportEmail;
  if (body.supportPhone !== undefined) updates.support_phone = body.supportPhone;
  if (body.websiteUrl !== undefined) updates.website_url = body.websiteUrl;
  if (typeof body.poweredByVisible === "boolean") updates.powered_by_visible = body.poweredByVisible;
  if (target.scope === "organisation" && typeof body.allowMerchantBranding === "boolean") {
    updates.allow_merchant_branding = body.allowMerchantBranding;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const profile = await ensureBrandingProfile(privilegedClient, target.scope, target.scopeId);

  const { data: updated, error } = await privilegedClient
    .from("branding_profiles")
    .update(updates)
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Failed to update branding." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: target.scope === "organisation" ? target.scopeId : null,
    merchantId: target.scope === "merchant" ? target.scopeId : null,
    action: "branding.updated",
    entityType: "branding_profile",
    entityId: profile.id,
    metadata: { scope: target.scope, updates },
  });

  return NextResponse.json({ profile: updated });
}
