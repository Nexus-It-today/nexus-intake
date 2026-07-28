"use client";

import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import MembershipsManager from "@/components/platform/MembershipsManager";
import { ORGANISATION_ROLES, MERCHANT_ROLES } from "@/lib/platform/types";
import { EmptyState, PageHeader } from "@/components/platform/ui";

export default function UsersPage() {
  const { activeContext, profile, previewReadOnly } = usePlatform();

  const canManageActiveOrg =
    !previewReadOnly &&
    activeContext?.type === "organisation" &&
    (profile?.isPlatformAdmin || ["organisation_owner", "organisation_admin"].includes(activeContext.role));
  const canManageActiveMerchant =
    !previewReadOnly &&
    activeContext?.type === "merchant" &&
    (profile?.isPlatformAdmin || ["merchant_owner", "merchant_admin"].includes(activeContext.role));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Users"
        description="Users are invited into an organisation or a merchant with a specific role - never given one global role for everything."
      />

      {activeContext?.type === "organisation" ? (
        <MembershipsManager
          kind="organisation"
          parentId={activeContext.id}
          roles={ORGANISATION_ROLES}
          canManage={Boolean(canManageActiveOrg)}
        />
      ) : activeContext?.type === "merchant" ? (
        <MembershipsManager
          kind="merchant"
          parentId={activeContext.id}
          roles={MERCHANT_ROLES}
          canManage={Boolean(canManageActiveMerchant)}
        />
      ) : (
        <EmptyState
          title="Switch to an organisation or merchant"
          description="Use the Working as switcher above to manage users for a specific organisation or merchant, or open one directly."
          action={
            <Link href="/app/foundation-it/organisations" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              Browse organisations
            </Link>
          }
        />
      )}
    </div>
  );
}
