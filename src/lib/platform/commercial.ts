import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformModuleRow = {
  module_key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default_enabled: boolean;
};

export type ResolvedEntitlement = {
  moduleKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  source: "platform_default" | "manual_grant";
  usageLimit: number | null;
  notes: string | null;
};

export async function fetchPlatformModules(client: SupabaseClient): Promise<PlatformModuleRow[]> {
  const { data, error } = await client
    .from("platform_modules")
    .select("module_key, name, description, sort_order, is_default_enabled")
    .order("sort_order");
  if (error) {
    console.error("Failed to fetch platform modules", { error });
    return [];
  }
  return (data as PlatformModuleRow[] | null) ?? [];
}

/**
 * Resolves an organisation's effective entitlement for every module: an
 * explicit organisation_module_entitlements row wins; otherwise the module's
 * catalog default applies, reported with source "platform_default" so the
 * UI can show where the entitlement came from even when no row exists yet.
 */
export async function resolveOrganisationEntitlements(
  client: SupabaseClient,
  organisationId: string
): Promise<ResolvedEntitlement[]> {
  const modules = await fetchPlatformModules(client);
  const { data: overrides, error } = await client
    .from("organisation_module_entitlements")
    .select("module_key, enabled, source, usage_limit, notes")
    .eq("organisation_id", organisationId);
  if (error) {
    console.error("Failed to fetch organisation module entitlements", { organisationId, error });
  }

  const overrideByModule = new Map((overrides ?? []).map((row) => [row.module_key as string, row]));

  return modules.map((module) => {
    const override = overrideByModule.get(module.module_key);
    if (override) {
      return {
        moduleKey: module.module_key,
        name: module.name,
        description: module.description,
        enabled: override.enabled,
        source: override.source as "platform_default" | "manual_grant",
        usageLimit: override.usage_limit,
        notes: override.notes,
      };
    }
    return {
      moduleKey: module.module_key,
      name: module.name,
      description: module.description,
      enabled: module.is_default_enabled,
      source: "platform_default",
      usageLimit: null,
      notes: null,
    };
  });
}

/**
 * Resolves a merchant's effective entitlement. A merchant can never exceed
 * its parent organisation's entitlement for the same module - if the
 * organisation itself does not have the module enabled, the merchant's
 * resolved value is forced to false regardless of any merchant-level row.
 */
export async function resolveMerchantEntitlements(
  client: SupabaseClient,
  merchantId: string,
  organisationId: string
): Promise<ResolvedEntitlement[]> {
  const [modules, organisationEntitlements] = await Promise.all([
    fetchPlatformModules(client),
    resolveOrganisationEntitlements(client, organisationId),
  ]);
  const organisationEnabledByModule = new Map(organisationEntitlements.map((entry) => [entry.moduleKey, entry.enabled]));
  const defaultEnabledByModule = new Map(modules.map((module) => [module.module_key, module.is_default_enabled]));

  const { data: overrides, error } = await client
    .from("merchant_module_entitlements")
    .select("module_key, enabled, usage_limit, notes")
    .eq("merchant_id", merchantId);
  if (error) {
    console.error("Failed to fetch merchant module entitlements", { merchantId, error });
  }
  const overrideByModule = new Map((overrides ?? []).map((row) => [row.module_key as string, row]));

  return organisationEntitlements.map((orgEntry) => {
    const override = overrideByModule.get(orgEntry.moduleKey);
    const orgAllows = organisationEnabledByModule.get(orgEntry.moduleKey) ?? false;
    // A merchant's baseline is the module's platform-wide default, NOT the
    // organisation's own resolved value - the organisation's manual grant is
    // only a ceiling (orgAllows, above), never something every sibling
    // merchant automatically inherits. A merchant only gets a
    // not-on-by-default module via its own explicit
    // merchant_module_entitlements row.
    const baselineEnabled = defaultEnabledByModule.get(orgEntry.moduleKey) ?? false;
    const requestedEnabled = override?.enabled ?? baselineEnabled;
    return {
      moduleKey: orgEntry.moduleKey,
      name: orgEntry.name,
      description: orgEntry.description,
      enabled: orgAllows && requestedEnabled,
      source: override ? "manual_grant" : orgEntry.source,
      usageLimit: override?.usage_limit ?? orgEntry.usageLimit,
      notes: override?.notes ?? orgEntry.notes,
    };
  });
}
