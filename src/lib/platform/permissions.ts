import { MERCHANT_MANAGE_ROLES, ORGANISATION_MANAGE_ROLES } from "./types";
import type { AccessProfile } from "./types";

/**
 * Application-level mirror of the can_access_ and can_manage_ Postgres helper
 * functions (supabase/migrations/20260727091000_foundation_memberships.sql).
 * API routes use the service-role client for writes, which bypasses RLS, so
 * these checks are the only enforcement point on that path - RLS remains a
 * second, independent line of defence for any query issued with a
 * user-scoped client.
 */

export function canAccessOrganisation(profile: AccessProfile, organisationId: string): boolean {
  if (profile.isPlatformAdmin) return true;
  return profile.organisations.some((org) => org.id === organisationId);
}

export function canManageOrganisation(profile: AccessProfile, organisationId: string): boolean {
  if (profile.isPlatformAdmin) return true;
  const membership = profile.organisations.find((org) => org.id === organisationId);
  return Boolean(membership && ORGANISATION_MANAGE_ROLES.includes(membership.role));
}

export function canAccessMerchant(profile: AccessProfile, merchantId: string, companyId?: string): boolean {
  if (profile.isPlatformAdmin) return true;
  if (profile.merchants.some((merchant) => merchant.id === merchantId)) return true;
  if (companyId && canAccessOrganisation(profile, companyId)) return true;
  return false;
}

export function canManageMerchant(profile: AccessProfile, merchantId: string, companyId?: string): boolean {
  if (profile.isPlatformAdmin) return true;
  const membership = profile.merchants.find((merchant) => merchant.id === merchantId);
  if (membership && MERCHANT_MANAGE_ROLES.includes(membership.role)) return true;
  if (companyId && canManageOrganisation(profile, companyId)) return true;
  return false;
}
