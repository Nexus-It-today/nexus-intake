/**
 * @deprecated Use src/lib/auth/index.ts (getCustomerSession) instead.
 * This file is kept for backward compatibility during Sprint 2 and will be
 * removed in Sprint 3 once all Route Handlers have been migrated.
 */
import { NextRequest } from "next/server";
import { type User, type SupabaseClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/auth";

export type CustomerPortalContext = {
  user: User;
  companyId: string;
  merchantCustomerId: string;
  customerEmail: string;
  customerName: string;
  contactName: string | null;
  privilegedClient: SupabaseClient;
};

export async function getCustomerPortalContext(
  request: NextRequest
): Promise<{ ok: true; value: CustomerPortalContext } | { ok: false; error: string; status: number }> {
  // Delegate to the unified auth module so logic lives in one place.
  // The result is re-wrapped into the legacy { ok: true; value: ... } shape
  // so all existing callers continue to work without modification.
  const session = await getCustomerSession(request);
  if (!session.ok) {
    return session;
  }
  return {
    ok: true,
    value: {
      user: session.user,
      companyId: session.companyId,
      merchantCustomerId: session.merchantCustomerId,
      customerEmail: session.customerEmail,
      customerName: session.customerName,
      contactName: session.contactName,
      privilegedClient: session.privilegedClient,
    },
  };
}

export function escapeSearchTerm(value: string): string {
  return value.replaceAll(",", " ").trim();
}

