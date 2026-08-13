"use client";

import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/platform/ui";
import { useAuthedResource } from "@/lib/platform/clientHooks";

type UsageResponse = {
  merchant: { id: string; name: string } | null;
  plan: {
    planKey: string;
    periodStart: string;
    periodEnd: string;
    emailAllowance: number;
    callMinutesAllowance: number;
  } | null;
  usage: {
    email: { used: number; remaining: number; percentageUsed: number; warning: "none" | "75" | "90" | "100" };
    calls: { usedMinutes: number; remainingMinutes: number; percentageUsed: number; warning: "none" | "75" | "90" | "100" };
  };
  selectedMerchantLedger: Array<{
    id: string;
    occurred_at: string;
    actor_email: string;
    actor_mode: string;
    action_key: string;
    channel: string | null;
    quantity: number;
    duration_seconds: number | null;
  }>;
  allMerchantsLedger: Array<{
    id: string;
    occurred_at: string;
    actor_email: string;
    actor_mode: string;
    merchant_id: string;
    merchantName: string;
    action_key: string;
    channel: string | null;
    quantity: number;
    duration_seconds: number | null;
  }>;
};

function warningTone(level: "none" | "75" | "90" | "100"): "neutral" | "warning" | "danger" {
  if (level === "100") return "danger";
  if (level === "90" || level === "75") return "warning";
  return "neutral";
}

export default function SwifteamUsagePage() {
  const { profile, activeContext } = usePlatform();
  const merchantMode = activeContext?.type === "merchant";

  const usageUrl = merchantMode ? "/api/swifteam/usage" : null;
  const { data } = useAuthedResource<UsageResponse>(usageUrl);
  const { data: allData } = useAuthedResource<UsageResponse>(profile?.isPlatformAdmin ? "/api/swifteam/usage?scope=all" : null);

  if (!merchantMode) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Swifteam V1" title="Usage" description="Allowance and metering for the selected merchant context." />
        <EmptyState title="Select a merchant context first" description="Switch to a merchant to view allowance, usage, and warnings." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Swifteam V1"
        title="Usage"
        description="Included monthly plan allowance for the selected merchant, with warning thresholds at 75%, 90%, and 100%."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Email allowance</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {data?.usage.email.used ?? 0} / {data?.plan?.emailAllowance ?? 200}
          </p>
          <p className="text-sm text-slate-600">Remaining: {data?.usage.email.remaining ?? 0}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={warningTone(data?.usage.email.warning ?? "none")}>{data?.usage.email.percentageUsed ?? 0}% used</Badge>
            {(data?.usage.email.warning ?? "none") !== "none" ? <span className="text-xs text-amber-700">Warning {data?.usage.email.warning}%</span> : null}
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Call minutes allowance</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {data?.usage.calls.usedMinutes ?? 0} / {data?.plan?.callMinutesAllowance ?? 200}
          </p>
          <p className="text-sm text-slate-600">Remaining: {data?.usage.calls.remainingMinutes ?? 0}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={warningTone(data?.usage.calls.warning ?? "none")}>{data?.usage.calls.percentageUsed ?? 0}% used</Badge>
            {(data?.usage.calls.warning ?? "none") !== "none" ? <span className="text-xs text-amber-700">Warning {data?.usage.calls.warning}%</span> : null}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Channel</Th>
              <Th>Usage</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.selectedMerchantLedger ?? []).slice(0, 20).map((event) => (
              <tr key={event.id}>
                <Td>{new Date(event.occurred_at).toLocaleString()}</Td>
                <Td>{event.actor_email}</Td>
                <Td>{event.action_key}</Td>
                <Td>{event.channel ?? "system"}</Td>
                <Td>{event.duration_seconds != null ? `${event.duration_seconds}s` : event.quantity}</Td>
              </tr>
            ))}
            {(data?.selectedMerchantLedger ?? []).length === 0 ? (
              <tr>
                <Td colSpan={5} className="text-center text-slate-400">No usage events yet for this merchant and period.</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      {profile?.isPlatformAdmin ? (
        <Card className="p-0">
          <div className="p-4">
            <h2 className="text-base font-semibold text-slate-900">Cross-merchant ledger (platform admin)</h2>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Merchant</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(allData?.allMerchantsLedger ?? []).slice(0, 30).map((event) => (
                <tr key={event.id}>
                  <Td>{new Date(event.occurred_at).toLocaleString()}</Td>
                  <Td>{event.merchantName}</Td>
                  <Td>{event.actor_email}</Td>
                  <Td>{event.action_key}</Td>
                </tr>
              ))}
              {(allData?.allMerchantsLedger ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={4} className="text-center text-slate-400">No cross-merchant usage events yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
