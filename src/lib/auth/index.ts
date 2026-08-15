/**
 * src/lib/auth/index.ts
 *
 * Unified authentication entry point for all Nexus Route Handlers.
 *
 * Replaces the three legacy helpers:
 *   - src/lib/serverAuth.ts      (getMerchantContext)
 *   - src/lib/customerPortalAuth.ts (getCustomerPortalContext)
 *   - src/lib/platform/supabaseServer.ts (getAuthenticatedUser)
 *
 * Exports three functions with consistent result shapes:
 *   getServerSession(req)   – bare user identity, no tenant context
 *   getMerchantSession(req) – operator/merchant context (companyId + merchantId)
 *   getCustomerSession(req) – customer portal context
 *
 * Both companyId (legacy) and merchantId (canonical) are included in
 * getMerchantSession so existing code using companyId continues to work
 * unchanged while Sprint 3 migrates call sites to merchantId.
 *
 * NOTE: The legacy files remain for backward compatibility during this sprint.
 * They are scheduled for removal in Sprint 3 once all call sites are updated.
 */

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ---------------------------------------------------------------------------
// Internal client factories (module-scoped singletons are intentionally NOT
// used here — each request gets its own short-lived client so tokens don't
// bleed across requests in a serverless environment).
// ---------------------------------------------------------------------------

function createAuthClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client — bypasses RLS. Callers MUST enforce permissions in application code. */
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

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AuthError = { ok: false; error: string; status: number };

export type ServerSession = {
  ok: true;
  user: User;
  token: string;
};

/**
 * Operator/merchant session — returned by getMerchantSession.
 *
 * companyId    — canonical tenant UUID from profiles.company_id.
 * merchantId   — canonical field; the first merchant_id the user holds an
 *                active membership for under this organisation.  May be null
 *                if no canonical merchant has been set up yet for this tenant.
 * role         — normalised legacy role string from profiles.role.
 * privilegedClient — service-role Supabase client. Callers must enforce
 *                    application-level permission checks before using it.
 */
export type MerchantSession = {
  ok: true;
  user: User;
  companyId: string;
  merchantId: string | null;
  role: string;
  privilegedClient: SupabaseClient;
};

/**
 * Customer portal session — returned by getCustomerSession.
 */
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

// ---------------------------------------------------------------------------
// Role normalisation (British spelling used consistently in new code; the
// legacy normalizeProfileRole export in src/lib/serverAuth.ts keeps its
// original American spelling for backward compat until Sprint 3 removes it)
// ---------------------------------------------------------------------------

export function normaliseProfileRole(role: unknown): string {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (!normalized) return "";
  if (["ops_admin", "operations_admin", "operations"].includes(normalized)) return "operations_admin";
  if (["platform_admin", "super_admin", "admin", "owner"].includes(normalized)) return "super_admin";
  if (normalized === "user") return "viewer";
  return normalized;
}

// ---------------------------------------------------------------------------
// getServerSession — bare identity check, no tenant context
// ---------------------------------------------------------------------------

/**
 * Verifies the bearer token and returns the resolved Supabase user.
 * Use this when a Route Handler only needs to know who is calling
 * (e.g. platform-admin endpoints that derive all context from AccessProfile).
 */
export async function getServerSession(
  request: NextRequest
): Promise<ServerSession | AuthError> {
  const token = parseBearerToken(request);
  if (!token) {
    return { ok: false, error: "Session expired. Please sign in again.", status: 401 };
  }

  const authClient = createAuthClient();
  if (!authClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, error: "Session expired. Please sign in again.", status: 401 };
  }

  return { ok: true, user: data.user, token };
}

// ---------------------------------------------------------------------------
// getMerchantSession — operator/merchant context
// ---------------------------------------------------------------------------

/**
 * Resolves the operator session for an authenticated merchant user.
 * Returns companyId (legacy), merchantId (canonical), and a privileged client.
 *
 * This is the replacement for getMerchantContext in src/lib/serverAuth.ts.
 * All Route Handlers that currently call getMerchantContext can switch to
 * this function — the result shape is a superset, so destructuring
 * { companyId, role, privilegedClient } still works unchanged.
 */
export async function getMerchantSession(
  request: NextRequest
): Promise<MerchantSession | AuthError> {
  const sessionResult = await getServerSession(request);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const { user } = sessionResult;

  // Resolve the canonical company tenant from the user's profile.
  const { data: profile, error: profileError } = await privilegedClient
    .from("profiles")
    .select("id, company_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle<{ id: string; company_id: string | null; role: string | null }>();

  if (profileError || !profile?.company_id) {
    return { ok: false, error: "No company linked to user", status: 403 };
  }

  const companyId = profile.company_id;

  // Resolve canonical merchantId: find the first active merchant_membership
  // for this user that belongs to the same canonical company.
  //
  // Done as two separate queries rather than a PostgREST joined filter because
  // the dot-notation form (.eq("merchants.company_id", ...)) may not be
  // applied server-side for a joined table, which would cause cross-tenant
  // merchant IDs to be returned.
  let merchantId: string | null = null;
  const { data: companyMerchants } = await privilegedClient
    .from("merchants")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active");

  const companyMerchantIds = (companyMerchants ?? []).map((merchant: { id: string }) => merchant.id);

  if (companyMerchantIds.length > 0) {
    const { data: membershipRow } = await privilegedClient
      .from("merchant_memberships")
      .select("merchant_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("merchant_id", companyMerchantIds)
      .limit(1)
      .maybeSingle<{ merchant_id: string }>();

    merchantId = membershipRow?.merchant_id ?? null;
  }

  return {
    ok: true,
    user,
    companyId,
    merchantId,
    role: normaliseProfileRole(profile.role),
    privilegedClient,
  };
}

// ---------------------------------------------------------------------------
// getCustomerSession — customer portal context
// ---------------------------------------------------------------------------

type PortalUserRow = {
  id: string;
  company_id: string;
  merchant_customer_id: string;
  email: string;
  full_name: string | null;
};

type MerchantCustomerRow = {
  id: string;
  customer_name: string;
  email: string | null;
  contact_name: string | null;
};

/**
 * Resolves the customer portal session for an authenticated customer user.
 * This is the replacement for getCustomerPortalContext in src/lib/customerPortalAuth.ts.
 */
export async function getCustomerSession(
  request: NextRequest
): Promise<CustomerSession | AuthError> {
  const sessionResult = await getServerSession(request);
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const { user } = sessionResult;

  const { data: portalUser, error: portalError } = await privilegedClient
    .from("customer_portal_users")
    .select("id, company_id, merchant_customer_id, email, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle<PortalUserRow>();

  if (portalError || !portalUser?.company_id || !portalUser.merchant_customer_id) {
    return { ok: false, error: "Customer portal access is not configured", status: 403 };
  }

  const { data: customer, error: customerError } = await privilegedClient
    .from("merchant_customers")
    .select("id, customer_name, email, contact_name")
    .eq("id", portalUser.merchant_customer_id)
    .eq("company_id", portalUser.company_id)
    .maybeSingle<MerchantCustomerRow>();

  if (customerError || !customer?.id) {
    return { ok: false, error: "Linked customer account not found", status: 404 };
  }

  return {
    ok: true,
    user,
    companyId: portalUser.company_id,
    merchantCustomerId: portalUser.merchant_customer_id,
    customerEmail: portalUser.email,
    customerName: customer.customer_name,
    contactName: customer.contact_name,
    privilegedClient,
  };
}
