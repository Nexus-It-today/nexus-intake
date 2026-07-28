import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessOrganisation } from "@/lib/platform/permissions";
import { resolveOrganisationEntitlements } from "@/lib/platform/commercial";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canAccessOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const entitlements = await resolveOrganisationEntitlements(privilegedClient, organisationId);
  return NextResponse.json({ entitlements, canManage: result.value.isPlatformAdmin });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Only Nexus platform admins set organisation-level entitlements - an
  // organisation cannot grant itself modules it hasn't been sold.
  if (!result.value.isPlatformAdmin) {
    return NextResponse.json({ error: "Only Nexus platform admins can change organisation entitlements." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    moduleKey?: string;
    enabled?: boolean;
    usageLimit?: number | null;
    notes?: string | null;
  };
  const moduleKey = body.moduleKey?.trim();
  if (!moduleKey || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "moduleKey and enabled are required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: entitlement, error } = await privilegedClient
    .from("organisation_module_entitlements")
    .upsert(
      {
        organisation_id: organisationId,
        module_key: moduleKey,
        enabled: body.enabled,
        source: "manual_grant",
        usage_limit: body.usageLimit ?? null,
        notes: body.notes ?? null,
        granted_by: result.value.userId,
      },
      { onConflict: "organisation_id,module_key" }
    )
    .select("*")
    .single();

  if (error || !entitlement) {
    return NextResponse.json({ error: error?.message ?? "Failed to update entitlement." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    action: "entitlement.updated",
    entityType: "organisation_module_entitlement",
    entityId: entitlement.id,
    metadata: { moduleKey, enabled: body.enabled, usageLimit: body.usageLimit ?? null },
  });

  return NextResponse.json({ entitlement });
}
