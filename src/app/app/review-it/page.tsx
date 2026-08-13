"use client";

import { usePlatform } from "@/components/platform/PlatformProvider";
import { Card, EmptyState, PageHeader } from "@/components/platform/ui";

export default function SwifteamReviewItPage() {
  const { activeContext } = usePlatform();

  if (activeContext?.type !== "merchant") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Swifteam V1" title="Review it." description="Review existing orders, account information, customer queries, and escalation notes." />
        <EmptyState title="Select a merchant context first" description="Switch to a merchant to review customer/account context." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Swifteam V1"
        title="Review it."
        description="Investigate existing order/account queries, keep notes, and escalate where required."
      />

      <Card>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Use Track it for live order/tracking context before replying.</li>
          <li>Capture customer query notes and escalation references in metered usage metadata.</li>
          <li>No invoice creation or financial transaction generation in V1.</li>
        </ul>
      </Card>
    </div>
  );
}
