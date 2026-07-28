"use client";

import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { Card, PageHeader } from "@/components/platform/ui";

export default function SettingsPage() {
  const { activeContext, userEmail } = usePlatform();

  const contextLabel =
    activeContext?.type === "organisation"
      ? `Organisation: ${activeContext.name}`
      : activeContext?.type === "merchant"
        ? `Merchant: ${activeContext.name}`
        : "Nexus it platform";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Foundation it" title="Settings" description="Account and workspace settings for your current context." />

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <p className="mt-2 text-sm text-slate-600">Signed in as {userEmail ?? "unknown"}.</p>
        <p className="text-sm text-slate-600">Currently working as: {contextLabel}.</p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Branding</h2>
        <p className="mt-2 text-sm text-slate-600">
          Manage logos, colours and contact details for the current context in{" "}
          <Link href="/app/brand-it" className="font-medium text-blue-600 hover:text-blue-700">
            Brand it
          </Link>
          .
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">More settings</h2>
        <p className="mt-2 text-sm text-slate-600">
          Additional workspace settings (notifications, integrations, subscriptions) will appear here as later modules are
          built on top of this foundation.
        </p>
      </Card>
    </div>
  );
}
