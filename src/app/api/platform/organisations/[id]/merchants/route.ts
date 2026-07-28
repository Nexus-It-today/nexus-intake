import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessOrganisation, canManageOrganisation } from "@/lib/platform/permissions";

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

  const { data: merchants, error } = await privilegedClient
    .from("merchants")
    .select("id, organisation_id, name, trading_name, status, created_at")
    .eq("organisation_id", organisationId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ merchants: merchants ?? [] });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canManageOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have permission to create merchants in this organisation." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; tradingName?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Merchant name is required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: organisation, error: organisationError } = await privilegedClient
    .from("organisations")
    .select("id")
    .eq("id", organisationId)
    .maybeSingle();
  if (organisationError || !organisation) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  const { data: merchant, error } = await privilegedClient
    .from("merchants")
    .insert({
      organisation_id: organisationId,
      name,
      trading_name: body.tradingName?.trim() || null,
      status: "active",
      created_by: result.value.userId,
    })
    .select("id, organisation_id, name, trading_name, status")
    .single();

  if (error || !merchant) {
    return NextResponse.json({ error: error?.message ?? "Failed to create merchant." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    merchantId: merchant.id,
    action: "merchant.created",
    entityType: "merchant",
    entityId: merchant.id,
    metadata: { name },
  });

  return NextResponse.json({ merchant }, { status: 201 });
}
