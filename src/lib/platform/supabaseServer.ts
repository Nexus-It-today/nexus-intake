import { NextRequest } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Client scoped to the caller's own token - used only to verify identity. */
export function createAuthClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client - bypasses RLS. Every caller MUST re-check permissions in application code. */
export function createPrivilegedClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
}

export type AuthenticatedUserResult =
  | { ok: true; user: User; token: string }
  | { ok: false; error: string; status: number };

/**
 * Verifies the bearer token against Supabase Auth and returns the resolved
 * user. This is the ONLY source of truth for "who is calling" - callers must
 * never trust a user id, organisation id, or merchant id supplied directly in
 * a request body without independently verifying it against this result.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUserResult> {
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
