"use client";

import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { Badge, Card, EmptyState, LoadingState, PageHeader, statusTone } from "@/components/platform/ui";

type AuditEvent = {
  id: string;
  actorEmail: string | null;
  action: string;
  entity_type: string;
  created_at: string;
};

function RecentActivity({ url }: { url: string | null }) {
  const { data, loading } = useAuthedResource<{ events: AuditEvent[] }>(url);

  if (!url) return null;
  if (loading) return <p className="text-sm text-slate-400">Loading recent activity...</p>;

  const events = data?.events ?? [];
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">No activity yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {events.slice(0, 8).map((event) => (
        <li key={event.id} className="flex items-center justify-between text-sm">
          <span className="text-slate-700">
            <span className="font-medium text-slate-900">{event.action}</span> · {event.entity_type}
          </span>
          <span className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function PlatformDashboard() {
  const { profile } = usePlatform();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Organisations</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{profile?.organisations.length ?? 0}</p>
          <Link href="/app/foundation-it/organisations" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            View organisations
          </Link>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Merchants</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{profile?.merchants.length ?? 0}</p>
          <Link href="/app/foundation-it/merchants" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            View merchants
          </Link>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Users</p>
          <Link href="/app/foundation-it/users" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            Manage users
          </Link>
        </Card>
      </div>

      {profile?.isPlatformAdmin ? (
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Master Admin</p>
          <p className="mt-1 text-sm text-slate-600">
            Preview any merchant or customer read-only, without changing their data. Use the &quot;Preview mode&quot; toggle
            in the Working as switcher for merchants, or search for a customer directly.
          </p>
          <Link href="/app/foundation-it/preview/customer" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            Preview as Customer
          </Link>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Recent platform activity</h2>
        <div className="mt-4">
          <RecentActivity url="/api/platform/audit-events?limit=8" />
        </div>
      </Card>
    </div>
  );
}

function OrganisationDashboard({ organisationId }: { organisationId: string }) {
  const { data, loading } = useAuthedResource<{
    organisation: { name: string; status: string; merchantCount: number; memberCount: number };
  }>(`/api/platform/organisations/${organisationId}`);

  if (loading) return <LoadingState label="Loading organisation dashboard..." />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(data?.organisation.status ?? "active")}>{data?.organisation.status}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Merchants</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.organisation.merchantCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Organisation users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.organisation.memberCount ?? 0}</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <Link href={`/app/foundation-it/organisations/${organisationId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Open organisation
          </Link>
        </div>
        <div className="mt-4">
          <RecentActivity url={`/api/platform/audit-events?organisationId=${organisationId}&limit=8`} />
        </div>
      </Card>
    </div>
  );
}

function MerchantDashboard({ merchantId }: { merchantId: string }) {
  const { data, loading } = useAuthedResource<{
    merchant: { name: string; status: string; memberCount: number; organisation_id: string };
  }>(`/api/platform/merchants/${merchantId}`);

  if (loading) return <LoadingState label="Loading merchant dashboard..." />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(data?.merchant.status ?? "active")}>{data?.merchant.status}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Merchant users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.merchant.memberCount ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Branding</p>
          <Link href={`/app/foundation-it/brand-it?scope=merchant&scopeId=${merchantId}`} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            View branding summary
          </Link>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <Link href={`/app/foundation-it/merchants/${merchantId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Open merchant
          </Link>
        </div>
        <div className="mt-4">
          <RecentActivity url={`/api/platform/audit-events?merchantId=${merchantId}&limit=8`} />
        </div>
      </Card>
    </div>
  );
}

export default function FoundationItDashboardPage() {
  const { loading, activeContext, profile } = usePlatform();

  if (loading) {
    return <LoadingState label="Loading Foundation it..." />;
  }

  const noAccess = profile && !profile.isPlatformAdmin && profile.organisations.length === 0 && profile.merchants.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Foundation it"
        description="An overview of your current Nexus it context - organisations, merchants, users and recent activity."
      />

      {noAccess ? (
        <EmptyState title="No access yet" description="You will see your organisations and merchants here once invited." />
      ) : activeContext?.type === "organisation" ? (
        <OrganisationDashboard organisationId={activeContext.id} />
      ) : activeContext?.type === "merchant" ? (
        <MerchantDashboard merchantId={activeContext.id} />
      ) : (
        <PlatformDashboard />
      )}
    </div>
  );
}
