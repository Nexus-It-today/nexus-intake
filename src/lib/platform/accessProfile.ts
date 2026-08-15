import { NextRequest } from "next/server";
import { createPrivilegedClient, getAuthenticatedUser } from "./supabaseServer";
import type {
  AccessProfile,
  MerchantRole,
  MerchantSummary,
  MembershipStatus,
  OrganisationRole,
  OrganisationSummary,
  TenantStatus,
} from "./types";

export type AccessProfileResult =
  | { ok: true; value: AccessProfile }
  | { ok: false; error: string; status: number };

type OrganisationRow = {
  id: string;
  name: string;
  trading_name: string | null;
  status: TenantStatus;
};

type MerchantRow = {
  id: string;
  company_id: string;
  name: string;
  trading_name: string | null;
  status: TenantStatus;
};

/**
 * Resolves the full, server-verified access profile for the calling user:
 * every organisation and merchant they hold an active/invited membership on,
 * plus whether they are a Nexus platform admin (who implicitly sees every
 * tenant). This is the single source of truth the "Working as" context
 * switcher and every /api/platform/* route are built on - nothing here is
 * ever taken from client-supplied input.
 */
export async function getAccessProfile(request: NextRequest): Promise<AccessProfileResult> {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.ok) {
    return { ok: false, error: authResult.error, status: authResult.status };
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const { user } = authResult;

  const { data: isPlatformAdminData, error: platformAdminError } = await privilegedClient.rpc(
    "is_platform_admin",
    { target_user_id: user.id }
  );
  if (platformAdminError) {
    return { ok: false, error: "Failed to resolve platform access", status: 500 };
  }
  const isPlatformAdmin = Boolean(isPlatformAdminData);

  const { data: orgMembershipRows, error: orgMembershipError } = await privilegedClient
    .from("organisation_memberships")
    .select("organisation_id, role, status")
    .eq("user_id", user.id);
  if (orgMembershipError) {
    return { ok: false, error: "Failed to load organisation memberships", status: 500 };
  }

  const { data: merchantMembershipRows, error: merchantMembershipError } = await privilegedClient
    .from("merchant_memberships")
    .select("merchant_id, role, status")
    .eq("user_id", user.id);
  if (merchantMembershipError) {
    return { ok: false, error: "Failed to load merchant memberships", status: 500 };
  }

  const membershipRoleByOrgId = new Map<string, { role: OrganisationRole; status: MembershipStatus }>();
  for (const row of orgMembershipRows ?? []) {
    membershipRoleByOrgId.set(row.organisation_id as string, {
      role: row.role as OrganisationRole,
      status: row.status as MembershipStatus,
    });
  }

  const membershipRoleByMerchantId = new Map<string, { role: MerchantRole; status: MembershipStatus }>();
  for (const row of merchantMembershipRows ?? []) {
    membershipRoleByMerchantId.set(row.merchant_id as string, {
      role: row.role as MerchantRole,
      status: row.status as MembershipStatus,
    });
  }

  let organisationRows: OrganisationRow[] = [];
  let merchantRows: MerchantRow[] = [];

  if (isPlatformAdmin) {
    // Platform admins can access every tenant, not just ones they hold an
    // explicit membership row for.
    const [{ data: allOrganisations }, { data: allMerchants }] = await Promise.all([
      privilegedClient
        .from("companies")
        .select("id, name, trading_name, status")
        .order("name"),
      privilegedClient
        .from("merchants")
        .select("id, company_id, name, trading_name, status")
        .order("name"),
    ]);
    organisationRows = (allOrganisations as OrganisationRow[] | null) ?? [];
    merchantRows = (allMerchants as MerchantRow[] | null) ?? [];
  } else {
    const orgIds = Array.from(membershipRoleByOrgId.keys());
    const merchantIds = Array.from(membershipRoleByMerchantId.keys());

    if (orgIds.length > 0) {
      const { data } = await privilegedClient
        .from("companies")
        .select("id, name, trading_name, status")
        .in("id", orgIds);
      organisationRows = (data as OrganisationRow[] | null) ?? [];
    }

    if (merchantIds.length > 0) {
      const { data } = await privilegedClient
        .from("merchants")
        .select("id, company_id, name, trading_name, status")
        .in("id", merchantIds);
      merchantRows = (data as MerchantRow[] | null) ?? [];
    }
  }

  const organisations: OrganisationSummary[] = organisationRows.map((row) => {
    const membership = membershipRoleByOrgId.get(row.id);
    return {
      id: row.id,
      name: row.name,
      tradingName: row.trading_name,
      status: row.status,
      role: membership?.role ?? "organisation_owner",
      membershipStatus: membership?.status ?? "active",
    };
  });

  const merchants: MerchantSummary[] = merchantRows.map((row) => {
    const membership = membershipRoleByMerchantId.get(row.id);
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      tradingName: row.trading_name,
      status: row.status,
      role: membership?.role ?? "merchant_owner",
      membershipStatus: membership?.status ?? "active",
    };
  });

  return {
    ok: true,
    value: {
      userId: user.id,
      email: user.email ?? null,
      isPlatformAdmin,
      organisations,
      merchants,
    },
  };
}
