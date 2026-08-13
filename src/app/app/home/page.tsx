"use client";

import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, PageHeader } from "@/components/platform/ui";
import { isSwifteamMaster, SWIFTEAM_CIRCLELOOP_IDENTITY, SWIFTEAM_MASTER_EMAIL } from "@/lib/swifteam";

export default function SwifteamHomePage() {
  const { profile, activeContext } = usePlatform();
  const master = isSwifteamMaster(profile?.email);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Swifteam V1"
        title="Home"
        description="Master Swifteam agent workspace for cross-merchant support, communication, tracking, review, and usage metering."
      />

      {master ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">Master Swifteam agent/tester</Badge>
            <span className="text-sm text-slate-600">{SWIFTEAM_MASTER_EMAIL}</span>
            <span className="text-sm text-slate-600">CircleLoop: {SWIFTEAM_CIRCLELOOP_IDENTITY}</span>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Signed in account is not the Swifteam master identity"
          description="Use swift@nexus.delivery for the primary Swifteam V1 acceptance flow."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Current context</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {activeContext?.type === "merchant" ? activeContext.name : activeContext?.type === "organisation" ? activeContext.name : "Platform"}
          </p>
          <p className="mt-1 text-sm text-slate-500">Switch context from the header to attribute usage per merchant.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Visible merchants</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{profile?.merchants.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Operating boundary</p>
          <p className="mt-2 text-sm text-slate-600">Read, investigate, communicate, note, escalate. No invoice/sales/financial generation in V1.</p>
        </Card>
      </div>
    </div>
  );
}
