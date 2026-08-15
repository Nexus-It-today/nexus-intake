import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessMerchant, canManageMerchant } from "@/lib/platform/permissions";
import { findOrInviteUser } from "@/lib/platform/inviteUser";
import { MERCHANT_ROLES } from "@/lib/platform/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: merchantId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: merchant } = await privilegedClient
    .from("merchants")
    .select("id, company_id")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canAccessMerchant(result.value, merchantId, merchant.company_id)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const { data: memberships, error } = await privilegedClient
    .from("merchant_memberships")
    .select("id, merchant_id, user_id, role, status, created_at")
    .eq("merchant_id", merchantId)
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
  const { id: merchantId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: merchant } = await privilegedClient
    .from("merchants")
    .select("id, company_id")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canManageMerchant(result.value, merchantId, merchant.company_id)) {
    return NextResponse.json({ error: "You do not have permission to invite members to this merchant." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = body.email?.trim();
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: "An email address is required." }, { status: 400 });
  }
  if (!role || !MERCHANT_ROLES.includes(role as (typeof MERCHANT_ROLES)[number])) {
    return NextResponse.json({ error: "A valid merchant role is required." }, { status: 400 });
  }

  const invite = await findOrInviteUser(privilegedClient, email);
  if ("error" in invite) {
    return NextResponse.json({ error: invite.error }, { status: 400 });
  }

  const { data: membership, error } = await privilegedClient
    .from("merchant_memberships")
    .upsert(
      {
        merchant_id: merchantId,
        user_id: invite.userId,
        role,
        status: invite.invited ? "invited" : "active",
        invited_by: result.value.userId,
      },
      { onConflict: "merchant_id,user_id" }
    )
    .select("id, merchant_id, user_id, role, status")
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: error?.message ?? "Failed to add membership." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: merchant.company_id,
    merchantId,
    action: "membership.created",
    entityType: "merchant_membership",
    entityId: membership.id,
    metadata: { email, role, invited: invite.invited },
  });

  return NextResponse.json({ membership: { ...membership, email } }, { status: 201 });
}
