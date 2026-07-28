import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessMerchant, canManageMerchant } from "@/lib/platform/permissions";
import { resolveMerchantEntitlements, resolveOrganisationEntitlements } from "@/lib/platform/commercial";

type RouteParams = { params: Promise<{ id: string }> };

async function loadMerchantOrganisationId(
  privilegedClient: NonNullable<ReturnType<typeof createPrivilegedClient>>,
  merchantId: string
): Promise<string | null> {
  const { data } = await privilegedClient.from("merchants").select("organisation_id").eq("id", merchantId).maybeSingle();
  return data?.organisation_id ?? null;
}

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

  const organisationId = await loadMerchantOrganisationId(privilegedClient, merchantId);
  if (!organisationId) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canAccessMerchant(result.value, merchantId, organisationId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const entitlements = await resolveMerchantEntitlements(privilegedClient, merchantId, organisationId);
  return NextResponse.json({ entitlements, canManage: canManageMerchant(result.value, merchantId, organisationId) });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: merchantId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const organisationId = await loadMerchantOrganisationId(privilegedClient, merchantId);
  if (!organisationId) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  if (!canManageMerchant(result.value, merchantId, organisationId)) {
    return NextResponse.json({ error: "You do not have permission to change this merchant's entitlements." }, { status: 403 });
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

  // A merchant can never exceed what its organisation has been granted -
  // "do not allow users to grant permissions above their own authority"
  // applies to entitlements too.
  if (body.enabled) {
    const organisationEntitlements = await resolveOrganisationEntitlements(privilegedClient, organisationId);
    const organisationAllows = organisationEntitlements.find((entry) => entry.moduleKey === moduleKey)?.enabled ?? false;
    if (!organisationAllows) {
      return NextResponse.json(
        { error: "This organisation does not have that module enabled - it cannot be granted to one of its merchants." },
        { status: 403 }
      );
    }
  }

  const { data: entitlement, error } = await privilegedClient
    .from("merchant_module_entitlements")
    .upsert(
      {
        merchant_id: merchantId,
        module_key: moduleKey,
        enabled: body.enabled,
        usage_limit: body.usageLimit ?? null,
        notes: body.notes ?? null,
        granted_by: result.value.userId,
      },
      { onConflict: "merchant_id,module_key" }
    )
    .select("*")
    .single();

  if (error || !entitlement) {
    return NextResponse.json({ error: error?.message ?? "Failed to update entitlement." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    merchantId,
    action: "entitlement.updated",
    entityType: "merchant_module_entitlement",
    entityId: entitlement.id,
    metadata: { moduleKey, enabled: body.enabled, usageLimit: body.usageLimit ?? null },
  });

  return NextResponse.json({ entitlement });
}
