import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessMerchant, canManageMerchant } from "@/lib/platform/permissions";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: merchant, error } = await privilegedClient
    .from("merchants")
    .select("id, company_id, name, trading_name, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canAccessMerchant(result.value, id, merchant.company_id)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const { count: memberCount } = await privilegedClient
    .from("merchant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", id);

  return NextResponse.json({ merchant: { ...merchant, memberCount: memberCount ?? 0 } });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: existingMerchant, error: fetchError } = await privilegedClient
    .from("merchants")
    .select("id, company_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existingMerchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canManageMerchant(result.value, id, existingMerchant.company_id)) {
    return NextResponse.json({ error: "You do not have permission to edit this merchant." }, { status: 403 });
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

  const { data: merchant, error } = await privilegedClient
    .from("merchants")
    .update(updates)
    .eq("id", id)
    .select("id, company_id, name, trading_name, status")
    .single();

  if (error || !merchant) {
    return NextResponse.json({ error: error?.message ?? "Failed to update merchant." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: existingMerchant.company_id,
    merchantId: id,
    action: updates.status === "archived" ? "merchant.archived" : "merchant.updated",
    entityType: "merchant",
    entityId: id,
    metadata: updates,
  });

  return NextResponse.json({ merchant });
}
