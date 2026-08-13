/**
 * @deprecated Use src/lib/auth/index.ts (getMerchantSession) instead.
 * This file is kept for backward compatibility during Sprint 2 and will be
 * removed in Sprint 3 once all Route Handlers have been migrated.
 */
import { NextRequest } from "next/server";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { getMerchantSession } from "@/lib/auth";
export { getMerchantSession, getServerSession } from "@/lib/auth";

export type MerchantContext = {
  user: User;
  companyId: string;
  organizationId: string;
  role: string;
  privilegedClient: SupabaseClient;
};

export function normalizeProfileRole(role: unknown): string {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (!normalized) return "";
  if (["ops_admin", "operations_admin", "operations"].includes(normalized)) return "operations_admin";
  if (["platform_admin", "super_admin", "admin", "owner"].includes(normalized)) return "super_admin";
  if (normalized === "user") return "viewer";
  return normalized;
}

export function canManageMerchants(role: unknown): boolean {
  return ["super_admin", "company_admin", "operations_admin"].includes(normalizeProfileRole(role));
}

export function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function getMerchantContext(
  request: NextRequest
): Promise<{ ok: true; value: MerchantContext } | { ok: false; error: string; status: number }> {
  // Delegate to the unified auth module so logic lives in one place.
  // The result is re-wrapped into the legacy { ok: true; value: ... } shape
  // so all existing callers continue to work without modification.
  const session = await getMerchantSession(request);
  if (!session.ok) {
    return session;
  }
  return {
    ok: true,
    value: {
      user: session.user,
      companyId: session.companyId,
      organizationId: session.companyId,
      role: session.role,
      privilegedClient: session.privilegedClient,
    },
  };
}

