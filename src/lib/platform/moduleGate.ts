/**
 * src/lib/platform/moduleGate.ts
 *
 * requireModule — a Route Handler wrapper that enforces module entitlement
 * checks before executing the handler body.
 *
 * Usage:
 *   export const GET = requireModule("intake", async (request, ctx) => {
 *     // ctx.merchantId / ctx.organisationId are guaranteed to be set
 *     // if the tenant has the module enabled
 *     return NextResponse.json({ ... });
 *   });
 *
 * Returns 402 with a structured error if:
 *   - The caller is not authenticated
 *   - No active merchant or organisation context can be resolved
 *   - The tenant's module entitlement is disabled or absent
 *
 * Platform admins (nexus_super_admin) bypass the entitlement check — they
 * can always access any module regardless of entitlement configuration.
 *
 * The check inspects merchant_module_entitlements first, then falls back to
 * organisation_module_entitlements, consistent with the billing hierarchy.
 */

import { NextRequest, NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getPlatformContext } from "./requestContext";
import type { PlatformContext } from "./requestContext";

export type ModuleGateContext = PlatformContext & {
  ok: true;
  merchantId: string | null;
  organisationId: string | null;
};

type ModuleGateHandler = (
  request: NextRequest,
  ctx: ModuleGateContext
) => Promise<NextResponse>;

/**
 * Wraps a Route Handler with a module entitlement gate.
 *
 * @param moduleKey  The platform_modules.module_key to check (e.g. "intake").
 * @param handler    The Route Handler to invoke when the check passes.
 */
export function requireModule(
  moduleKey: string,
  handler: ModuleGateHandler
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ctx = await getPlatformContext(request);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const { accessProfile, activeContext, privilegedClient } = ctx;

    // Derive the IDs we will check entitlements against.
    let merchantId: string | null = null;
    let organisationId: string | null = null;

    if (activeContext.type === "merchant") {
      merchantId = activeContext.id;
      organisationId = activeContext.organisationId;
    } else if (activeContext.type === "organisation") {
      organisationId = activeContext.id;
    }

    // Platform admins bypass entitlement checks.
    if (!accessProfile.isPlatformAdmin) {
      const enabled = await isModuleEnabled(
        privilegedClient,
        moduleKey,
        merchantId,
        organisationId
      );
      if (!enabled) {
        return NextResponse.json(
          {
            error: "Module not enabled",
            moduleKey,
            code: "MODULE_NOT_ENABLED",
          },
          { status: 402 }
        );
      }
    }

    const gateCtx: ModuleGateContext = { ...ctx, merchantId, organisationId };
    return handler(request, gateCtx);
  };
}

// ---------------------------------------------------------------------------
// Internal: check entitlement tables
// ---------------------------------------------------------------------------

async function isModuleEnabled(
  privilegedClient: SupabaseClient | null,
  moduleKey: string,
  merchantId: string | null,
  organisationId: string | null
): Promise<boolean> {
  if (!privilegedClient) return false;

  // Merchant-level entitlement takes precedence.
  if (merchantId) {
    const { data: merchantEntitlement } = await privilegedClient
      .from("merchant_module_entitlements")
      .select("enabled")
      .eq("merchant_id", merchantId)
      .eq("module_key", moduleKey)
      .maybeSingle<{ enabled: boolean }>();

    if (merchantEntitlement !== null && merchantEntitlement !== undefined) {
      return merchantEntitlement.enabled;
    }
  }

  // Fall back to organisation-level entitlement.
  if (organisationId) {
    const { data: orgEntitlement } = await privilegedClient
      .from("organisation_module_entitlements")
      .select("enabled")
      .eq("organisation_id", organisationId)
      .eq("module_key", moduleKey)
      .maybeSingle<{ enabled: boolean }>();

    if (orgEntitlement !== null && orgEntitlement !== undefined) {
      return orgEntitlement.enabled;
    }
  }

  // Fall back to platform default.
  const { data: platformModule } = await privilegedClient
    .from("platform_modules")
    .select("is_default_enabled")
    .eq("module_key", moduleKey)
    .maybeSingle<{ is_default_enabled: boolean }>();

  return platformModule?.is_default_enabled ?? false;
}
