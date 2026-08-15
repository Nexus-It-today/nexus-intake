"use client";

import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Table, Td, Th } from "@/components/platform/ui";

type AuditEvent = {
  id: string;
  actor_user_id: string | null;
  actorEmail: string | null;
  organisation_id: string | null;
  merchant_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  source: string;
  created_at: string;
};

export default function AuditItPage() {
  const { activeContext, profile } = usePlatform();

  const params = new URLSearchParams();
  if (activeContext?.type === "organisation") params.set("organisationId", activeContext.id);
  if (activeContext?.type === "merchant") {
    params.set("merchantId", activeContext.id);
    params.set("organisationId", activeContext.companyId);
  }
  params.set("limit", "100");

  const canQuery = Boolean(profile?.isPlatformAdmin) || activeContext?.type !== "platform";
  const { data, loading, error } = useAuthedResource<{ events: AuditEvent[] }>(
    canQuery ? `/api/platform/audit-events?${params.toString()}` : null
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Audit it"
        description="An immutable record of organisation, merchant, membership, branding and context-switching activity. Nobody, including platform admins, can edit these events."
      />

      {!canQuery ? (
        <EmptyState title="Select a context" description="Switch to an organisation or merchant to view its audit trail." />
      ) : loading ? (
        <LoadingState label="Loading audit events..." />
      ) : error ? (
        <ErrorState description={error} />
      ) : (
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.events ?? []).map((event) => (
                <tr key={event.id}>
                  <Td>{new Date(event.created_at).toLocaleString()}</Td>
                  <Td>{event.actorEmail ?? "-"}</Td>
                  <Td className="font-medium text-slate-900">{event.action}</Td>
                  <Td>
                    {event.entity_type}
                    {event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ""}
                  </Td>
                  <Td>{event.source}</Td>
                </tr>
              ))}
              {(data?.events ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={5} className="py-8 text-center text-slate-400">
                    No audit events yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
