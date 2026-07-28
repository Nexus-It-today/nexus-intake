import Link from "next/link";
import AppShell from "@/components/AppShell";
import { WorkspaceHero } from "@/components/WorkspaceDesignSystem";

const SETTINGS_AREAS = [
  {
    title: "Brand and identity",
    description: "Logos, colours and contact details, with merchant → organisation → platform inheritance.",
    href: "/app/brand-it",
  },
  {
    title: "Users and permissions",
    description: "Invite, assign roles to, and remove organisation and merchant members.",
    href: "/app/users",
  },
  {
    title: "Integration credentials",
    description: "Configure organisation-scoped credentials for connected providers.",
    href: "/app/integrate-it",
  },
  {
    title: "Integrate it",
    description: "View and manage every available integration provider.",
    href: "/app/integrate-it",
  },
  {
    title: "Commercial rules",
    description: "Module entitlements per organisation and merchant, with usage limits.",
    href: "/app/commercial-it",
  },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <section className="space-y-6">
        <WorkspaceHero
          kicker="Workspace governance"
          title="Settings"
          description="Configure identity, integrations, billing preferences, team access and environment governance."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
              <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
              <path d="M2 12h2m16 0h2M12 2v2m0 16v2m7.07-15.07l-1.41 1.41M6.34 17.66l-1.41 1.41m0-14.14l1.41 1.41m11.32 11.32l1.41 1.41" />
            </svg>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SETTINGS_AREAS.map((area) => (
            <Link
              key={area.title}
              href={area.href}
              className="nexus-card block rounded-2xl px-4 py-4 text-sm text-slate-200 transition hover:border-blue-400/60 hover:bg-white/5"
            >
              <p className="font-semibold text-white">{area.title}</p>
              <p className="mt-1 text-xs text-slate-400">{area.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
