import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canManageOrganisation } from "@/lib/platform/permissions";
import { ORGANISATION_ROLES } from "@/lib/platform/types";

type RouteParams = { params: Promise<{ membershipId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { membershipId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: existing, error: fetchError } = await privilegedClient
    .from("organisation_memberships")
    .select("id, organisation_id, role, status")
    .eq("id", membershipId)
    .maybeSingle();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }
  if (!canManageOrganisation(result.value, existing.organisation_id)) {
    return NextResponse.json({ error: "You do not have permission to manage this membership." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { role?: string; status?: string };
  const updates: Record<string, unknown> = {};
  if (body.role && ORGANISATION_ROLES.includes(body.role as (typeof ORGANISATION_ROLES)[number])) {
    updates.role = body.role;
  }
  if (body.status && ["active", "invited", "suspended"].includes(body.status)) {
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: membership, error } = await privilegedClient
    .from("organisation_memberships")
    .update(updates)
    .eq("id", membershipId)
    .select("id, organisation_id, user_id, role, status")
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: error?.message ?? "Failed to update membership." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: existing.organisation_id,
    action: "membership.role_changed",
    entityType: "organisation_membership",
    entityId: membershipId,
    metadata: { before: { role: existing.role, status: existing.status }, after: updates },
  });

  return NextResponse.json({ membership });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { membershipId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: existing, error: fetchError } = await privilegedClient
    .from("organisation_memberships")
    .select("id, organisation_id, user_id, role")
    .eq("id", membershipId)
    .maybeSingle();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }
  if (!canManageOrganisation(result.value, existing.organisation_id)) {
    return NextResponse.json({ error: "You do not have permission to remove this membership." }, { status: 403 });
  }

  const { error } = await privilegedClient.from("organisation_memberships").delete().eq("id", membershipId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: existing.organisation_id,
    action: "membership.removed",
    entityType: "organisation_membership",
    entityId: membershipId,
    metadata: { userId: existing.user_id, role: existing.role },
  });

  return NextResponse.json({ ok: true });
}
