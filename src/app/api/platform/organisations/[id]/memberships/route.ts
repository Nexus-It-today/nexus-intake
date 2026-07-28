import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessOrganisation, canManageOrganisation } from "@/lib/platform/permissions";
import { findOrInviteUser } from "@/lib/platform/inviteUser";
import { ORGANISATION_ROLES } from "@/lib/platform/types";

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

  const { data: memberships, error } = await privilegedClient
    .from("organisation_memberships")
    .select("id, organisation_id, user_id, role, status, created_at")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: userList } = await privilegedClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailByUserId = new Map((userList?.users ?? []).map((user) => [user.id, user.email ?? null]));

  const enriched = (memberships ?? []).map((membership) => ({
    ...membership,
    email: emailByUserId.get(membership.user_id) ?? null,
  }));

  return NextResponse.json({ memberships: enriched });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canManageOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have permission to invite members to this organisation." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = body.email?.trim();
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: "An email address is required." }, { status: 400 });
  }
  if (!role || !ORGANISATION_ROLES.includes(role as (typeof ORGANISATION_ROLES)[number])) {
    return NextResponse.json({ error: "A valid organisation role is required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const invite = await findOrInviteUser(privilegedClient, email);
  if ("error" in invite) {
    return NextResponse.json({ error: invite.error }, { status: 400 });
  }

  const { data: membership, error } = await privilegedClient
    .from("organisation_memberships")
    .upsert(
      {
        organisation_id: organisationId,
        user_id: invite.userId,
        role,
        status: invite.invited ? "invited" : "active",
        invited_by: result.value.userId,
      },
      { onConflict: "organisation_id,user_id" }
    )
    .select("id, organisation_id, user_id, role, status")
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: error?.message ?? "Failed to add membership." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    action: "membership.created",
    entityType: "organisation_membership",
    entityId: membership.id,
    metadata: { email, role, invited: invite.invited },
  });

  return NextResponse.json({ membership: { ...membership, email } }, { status: 201 });
}
