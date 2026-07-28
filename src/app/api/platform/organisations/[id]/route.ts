import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessOrganisation, canManageOrganisation } from "@/lib/platform/permissions";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canAccessOrganisation(result.value, id)) {
    return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: organisation, error } = await privilegedClient
    .from("organisations")
    .select("id, slug, name, trading_name, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!organisation) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  const [{ count: merchantCount }, { count: memberCount }] = await Promise.all([
    privilegedClient.from("merchants").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    privilegedClient.from("organisation_memberships").select("id", { count: "exact", head: true }).eq("organisation_id", id),
  ]);

  return NextResponse.json({
    organisation: { ...organisation, merchantCount: merchantCount ?? 0, memberCount: memberCount ?? 0 },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canManageOrganisation(result.value, id)) {
    return NextResponse.json({ error: "You do not have permission to edit this organisation." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    tradingName?: string | null;
    status?: "active" | "suspended" | "archived";
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.tradingName !== undefined) updates.trading_name = body.tradingName?.trim() || null;
  if (body.status && ["active", "suspended", "archived"].includes(body.status)) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: organisation, error } = await privilegedClient
    .from("organisations")
    .update(updates)
    .eq("id", id)
    .select("id, slug, name, trading_name, status")
    .single();

  if (error || !organisation) {
    return NextResponse.json({ error: error?.message ?? "Failed to update organisation." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: id,
    action: updates.status === "archived" ? "organisation.archived" : "organisation.updated",
    entityType: "organisation",
    entityId: id,
    metadata: updates,
  });

  return NextResponse.json({ organisation });
}
