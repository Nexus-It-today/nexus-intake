import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canManageMerchant } from "@/lib/platform/permissions";
import { MERCHANT_ROLES } from "@/lib/platform/types";

type RouteParams = { params: Promise<{ membershipId: string }> };

type MembershipWithMerchant = {
  id: string;
  merchant_id: string;
  user_id: string;
  role: string;
  status: string;
  organisationId: string | null;
};

async function loadMembershipWithMerchant(
  privilegedClient: NonNullable<ReturnType<typeof createPrivilegedClient>>,
  membershipId: string
): Promise<MembershipWithMerchant | null> {
  const { data: membership } = await privilegedClient
    .from("merchant_memberships")
    .select("id, merchant_id, user_id, role, status")
    .eq("id", membershipId)
    .maybeSingle();
  if (!membership) return null;

  const { data: merchant } = await privilegedClient
    .from("merchants")
    .select("organisation_id")
    .eq("id", membership.merchant_id)
    .maybeSingle();

  return { ...membership, organisationId: merchant?.organisation_id ?? null };
}

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

  const existing = await loadMembershipWithMerchant(privilegedClient, membershipId);
  if (!existing) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }
  if (!canManageMerchant(result.value, existing.merchant_id, existing.organisationId ?? undefined)) {
    return NextResponse.json({ error: "You do not have permission to manage this membership." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { role?: string; status?: string };
  const updates: Record<string, unknown> = {};
  if (body.role && MERCHANT_ROLES.includes(body.role as (typeof MERCHANT_ROLES)[number])) {
    updates.role = body.role;
  }
  if (body.status && ["active", "invited", "suspended"].includes(body.status)) {
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: membership, error } = await privilegedClient
    .from("merchant_memberships")
    .update(updates)
    .eq("id", membershipId)
    .select("id, merchant_id, user_id, role, status")
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: error?.message ?? "Failed to update membership." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: existing.organisationId,
    merchantId: existing.merchant_id,
    action: "membership.role_changed",
    entityType: "merchant_membership",
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

  const existing = await loadMembershipWithMerchant(privilegedClient, membershipId);
  if (!existing) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }
  if (!canManageMerchant(result.value, existing.merchant_id, existing.organisationId ?? undefined)) {
    return NextResponse.json({ error: "You do not have permission to remove this membership." }, { status: 403 });
  }

  const { error } = await privilegedClient.from("merchant_memberships").delete().eq("id", membershipId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: existing.organisationId,
    merchantId: existing.merchant_id,
    action: "membership.removed",
    entityType: "merchant_membership",
    entityId: membershipId,
    metadata: { userId: existing.user_id, role: existing.role },
  });

  return NextResponse.json({ ok: true });
}
