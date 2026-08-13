"use client";

import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/platform/ui";

export default function SwifteamCustomersPage() {
  const { profile, activeContext } = usePlatform();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Swifteam V1"
        title="Customers"
        description="All merchants visible to the current actor, with customer-context switching from the header."
      />

      {activeContext?.type === "merchant" ? (
        <Card>
          <p className="text-sm text-slate-700">
            Selected merchant context: <span className="font-semibold text-slate-900">{activeContext.name}</span>
          </p>
        </Card>
      ) : null}

      {!profile || profile.merchants.length === 0 ? (
        <EmptyState title="No merchants visible" description="Merchant access appears here once memberships are active." />
      ) : (
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Merchant</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Selected</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.merchants.map((merchant) => {
                const selected = activeContext?.type === "merchant" && activeContext.id === merchant.id;
                return (
                  <tr key={merchant.id}>
                    <Td className="font-medium text-slate-900">{merchant.name}</Td>
                    <Td>{merchant.role.replaceAll("_", " ")}</Td>
                    <Td>{merchant.status}</Td>
                    <Td>{selected ? <Badge tone="info">Active context</Badge> : <span className="text-slate-400">—</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
