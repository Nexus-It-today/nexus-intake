import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { findOrInviteUser } from "@/lib/platform/inviteUser";
import { ORGANISATION_MANAGE_ROLES } from "@/lib/platform/types";

export async function GET(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ organisations: result.value.organisations });
}

export async function POST(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Only Nexus platform admins can onboard new tenant organisations.
  if (!result.value.isPlatformAdmin) {
    return NextResponse.json({ error: "Only Nexus platform admins can create organisations." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    tradingName?: string;
    ownerEmail?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: organisation, error } = await privilegedClient
    .from("companies")
    .insert({
      name,
      trading_name: body.tradingName?.trim() || null,
      status: "active",
      source_system: "app",
    })
    .select("id, name, trading_name, status")
    .single();

  if (error || !organisation) {
    return NextResponse.json({ error: error?.message ?? "Failed to create organisation." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: organisation.id,
    action: "organisation.created",
    entityType: "organisation",
    entityId: organisation.id,
    metadata: { name },
  });

  let ownerInviteError: string | null = null;
  if (body.ownerEmail?.trim()) {
    const invite = await findOrInviteUser(privilegedClient, body.ownerEmail);
    if ("error" in invite) {
      ownerInviteError = invite.error;
    } else {
      const { error: membershipError } = await privilegedClient.from("organisation_memberships").upsert(
        {
          organisation_id: organisation.id,
          user_id: invite.userId,
          role: ORGANISATION_MANAGE_ROLES[0],
          status: invite.invited ? "invited" : "active",
          invited_by: result.value.userId,
        },
        { onConflict: "organisation_id,user_id" }
      );
      if (membershipError) {
        ownerInviteError = membershipError.message;
      } else {
        await recordAuditEvent(privilegedClient, {
          actorUserId: result.value.userId,
          organisationId: organisation.id,
          action: "membership.created",
          entityType: "organisation_membership",
          entityId: invite.userId,
          metadata: { role: ORGANISATION_MANAGE_ROLES[0], email: body.ownerEmail.trim() },
        });
      }
    }
  }

  return NextResponse.json({ organisation, ownerInviteError }, { status: 201 });
}
