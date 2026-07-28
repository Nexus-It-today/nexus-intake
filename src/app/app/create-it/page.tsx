"use client";

import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { Card, PageHeader } from "@/components/platform/ui";

type QuickLink = { title: string; description: string; href: string; visible: boolean };

export default function CreateItPage() {
  const { profile, activeContext } = usePlatform();

  const canCreateOrganisation = Boolean(profile?.isPlatformAdmin);
  const canCreateMerchant =
    activeContext?.type === "organisation" &&
    (profile?.isPlatformAdmin || ["organisation_owner", "organisation_admin"].includes(activeContext.role));

  const links: QuickLink[] = [
    {
      title: "Create an organisation",
      description: "Onboard a new customer organisation as a tenant of Nexus it.",
      href: "/app/organisations",
      visible: canCreateOrganisation,
    },
    {
      title: "Create a merchant",
      description: "Add a merchant under the organisation you are currently working as.",
      href: activeContext?.type === "organisation" ? `/app/organisations/${activeContext.id}` : "/app/organisations",
      visible: Boolean(canCreateMerchant) || Boolean(profile?.organisations.length),
    },
    {
      title: "Invite an organisation user",
      description: "Add a user to your organisation with an owner, admin, operator or viewer role.",
      href: "/app/users",
      visible: activeContext?.type === "organisation",
    },
    {
      title: "Invite a merchant user",
      description: "Add a user to your merchant with an owner, admin, operator or viewer role.",
      href: "/app/users",
      visible: activeContext?.type === "merchant",
    },
    {
      title: "Assign a role or remove access",
      description: "Change a member's role, or remove their access to an organisation or merchant.",
      href: "/app/users",
      visible: activeContext?.type === "organisation" || activeContext?.type === "merchant",
    },
    {
      title: "Set up branding",
      description: "Upload logos and set colours and contact details for this organisation or merchant.",
      href: "/app/brand-it",
      visible: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Create it"
        description="What do you want to Nexus it today? Every foundational workflow starts here."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {links
          .filter((link) => link.visible)
          .map((link) => (
            <Link key={link.title} href={link.href}>
              <Card className="h-full transition hover:border-blue-300 hover:shadow-md">
                <p className="text-base font-semibold text-slate-900">{link.title}</p>
                <p className="mt-2 text-sm text-slate-600">{link.description}</p>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
