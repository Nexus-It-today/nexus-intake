/**
 * Canonical server-side authentication helpers for Nexus.
 *
 * Production identity model:
 *   auth.users.id = public.profiles.id
 *   company access = public.company_memberships.profile_id
 *   merchant access = public.merchant_memberships.profile_id
 *   platform-wide access = public.platform_super_admins.profile_id
 *
 * Keep all privileged database access behind an authenticated user lookup and
 * derive tenancy from memberships. Do not infer company or role from profiles.
 */

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAuthClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createPrivilegedClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
}

export type AuthError = { ok: false; error: string; status: number };

export type ServerSession = {
  ok: true;
  user: User;
  token: string;
};

export type MerchantSession = {
  ok: true;
  user: User;
  profileId: string;
  companyId: string;
  merchantId: string | null;
  role: string;
  isPlatformAdmin: boolean;
  privilegedClient: SupabaseClient;
};

export type CustomerSession = {
  ok: true;
  user: User;
  companyId: string;
  merchantCustomerId: string;
  customerEmail: string;
  customerName: string;
  contactName: string | null;
  privilegedClient: SupabaseClient;
};

export function normaliseProfileRole(role: unknown): string {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (!normalized) return "";
  if (["ops_admin", "operations_admin", "operations"].includes(normalized)) return "operations_admin";
  if (["platform_admin", "super_admin", "admin", "owner"].includes(normalized)) return "super_admin";
  if (normalized === "user") return "viewer";
  return normalized;
}

export async function getServerSession(request: NextRequest): Promise<ServerSession | AuthError> {
  const token = parseBearerToken(request);
  if (!token) return { ok: false, error: "Session expired. Please sign in again.", status: 401 };

  const authClient = createAuthClient();
  if (!authClient) return { ok: false, error: "Supabase not configured", status: 500 };

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, error: "Session expired. Please sign in again.", status: 401 };
  }

  return { ok: true, user: data.user, token };
}

export async function getMerchantSession(request: NextRequest): Promise<MerchantSession | AuthError> {
  const sessionResult = await getServerSession(request);
  if (!sessionResult.ok) return sessionResult;

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) return { ok: false, error: "Supabase not configured", status: 500 };

  const { user } = sessionResult;
  const profileId = user.id;

  const { data: profile, error: profileError } = await privilegedClient
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle<{ id: string }>();

  if (profileError || !profile?.id) {
    return { ok: false, error: "Nexus profile is not configured", status: 403 };
  }

  const { data: platformAdmin } = await privilegedClient
    .from("platform_super_admins")
    .select("id")
    .eq("profile_id", profileId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle<{ id: string }>();

  const isPlatformAdmin = Boolean(platformAdmin?.id);

  const { data: companyMemberships, error: companyError } = await privilegedClient
    .from("company_memberships")
    .select("company_id, role, access_scope")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (companyError || !companyMemberships || companyMemberships.length === 0) {
    return { ok: false, error: "No active company membership linked to user", status: 403 };
  }

  // V1 uses the user's first active company membership as their working company.
  // Platform super admins may still query across merchants/companies in endpoints
  // that explicitly honour isPlatformAdmin.
  const companyMembership = companyMemberships[0] as {
    company_id: string;
    role: string | null;
    access_scope: string | null;
  };
  const companyId = companyMembership.company_id;

  const { data: merchantMemberships } = await privilegedClient
    .from("merchant_memberships")
    .select("merchant_id, role")
    .eq("profile_id", profileId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const firstMerchant = merchantMemberships?.[0] as
    | { merchant_id: string; role: string | null }
    | undefined;

  return {
    ok: true,
    user,
    profileId,
    companyId,
    merchantId: firstMerchant?.merchant_id ?? null,
    role: isPlatformAdmin ? "super_admin" : normaliseProfileRole(companyMembership.role),
    isPlatformAdmin,
    privilegedClient,
  };
}

/**
 * Customer portal identity is intentionally not guessed from the operator
 * tenancy model. The canonical production schema currently has customers but
 * no auth-to-customer membership table, so callers receive an explicit setup
 * response until that portal binding is implemented forward.
 */
export async function getCustomerSession(request: NextRequest): Promise<CustomerSession | AuthError> {
  const sessionResult = await getServerSession(request);
  if (!sessionResult.ok) return sessionResult;
  return { ok: false, error: "Customer portal access is not configured in the canonical production tenancy model", status: 403 };
}
