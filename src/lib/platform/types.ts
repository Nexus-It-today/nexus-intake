export type TenantStatus = "active" | "suspended" | "archived";
export type MembershipStatus = "active" | "invited" | "suspended";

export type OrganisationRole =
  | "organisation_owner"
  | "organisation_admin"
  | "organisation_operator"
  | "organisation_viewer";

export type MerchantRole = "merchant_owner" | "merchant_admin" | "merchant_operator" | "merchant_viewer";

export const ORGANISATION_ROLES: OrganisationRole[] = [
  "organisation_owner",
  "organisation_admin",
  "organisation_operator",
  "organisation_viewer",
];

export const MERCHANT_ROLES: MerchantRole[] = [
  "merchant_owner",
  "merchant_admin",
  "merchant_operator",
  "merchant_viewer",
];

export const ORGANISATION_MANAGE_ROLES: OrganisationRole[] = ["organisation_owner", "organisation_admin"];
export const MERCHANT_MANAGE_ROLES: MerchantRole[] = ["merchant_owner", "merchant_admin"];

export type OrganisationSummary = {
  id: string;
  slug: string;
  name: string;
  tradingName: string | null;
  status: TenantStatus;
  role: OrganisationRole;
  membershipStatus: MembershipStatus;
};

export type MerchantSummary = {
  id: string;
  organisationId: string;
  name: string;
  tradingName: string | null;
  status: TenantStatus;
  role: MerchantRole;
  membershipStatus: MembershipStatus;
};

export type AccessProfile = {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  organisations: OrganisationSummary[];
  merchants: MerchantSummary[];
};

export type ActiveContext =
  | { type: "platform" }
  | { type: "organisation"; id: string; name: string; role: OrganisationRole }
  | { type: "merchant"; id: string; organisationId: string; name: string; role: MerchantRole };

export type StoredContextRequest = { type: "organisation" | "merchant"; id: string } | { type: "platform" };
