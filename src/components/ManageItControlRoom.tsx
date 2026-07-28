"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import DocumentsTable, { type DocumentTableRow } from "@/components/DocumentsTable";
import LiveOperationsDashboard from "@/components/LiveOperationsDashboard";
import { useRuntimeCompanyId } from "@/lib/useRuntimeCompanyId";
import {
  FALLBACK_AUDIT_LOGS,
  getManageItAccessProfile,
  getManageItSection,
  getVisibleManageItSections,
  hasPermission,
  logAdminAction,
  MANAGE_IT_SECTIONS,
  type AuditLogEntry,
  type ManageItAccessProfile,
  type ManageItSectionSlug,
  syncManageItSession,
} from "@/lib/manageIt";

const initialCustomers = [
  {
    id: "customer-doorway",
    company: "Doorway Group LTD",
    sector: "Furniture",
    status: "Active",
    plan: "Scale",
    health: "Healthy",
  },
  {
    id: "customer-nook",
    company: "Nook Home",
    sector: "Homeware",
    status: "Review",
    plan: "Growth",
    health: "POD backlog",
  },
  {
    id: "customer-di",
    company: "DI Designs LTD",
    sector: "Design",
    status: "Suspended",
    plan: "Starter",
    health: "Billing hold",
  },
];

const initialCompanies = [
  {
    id: "company-doorway",
    name: "Doorway Group LTD",
    logo: "DG",
    subscription: "Scale",
    status: "Active",
    usage: "84% API allowance",
  },
  {
    id: "company-nook",
    name: "Nook Home",
    logo: "NH",
    subscription: "Growth",
    status: "Trial",
    usage: "62% workflow usage",
  },
  {
    id: "company-warehouse",
    name: "North Hub Warehousing",
    logo: "NW",
    subscription: "Enterprise",
    status: "Active",
    usage: "11 feature flags enabled",
  },
];

const initialTeamMembers = [
  {
    id: "team-1",
    name: "Olivia Ross",
    email: "office@nexus.delivery",
    role: "super_admin",
    status: "Active",
    activity: "Viewed platform audit log 3m ago",
  },
  {
    id: "team-2",
    name: "Ben Carter",
    email: "ops@nexus.delivery",
    role: "company_admin",
    status: "Active",
    activity: "Reset customer password 22m ago",
  },
  {
    id: "team-3",
    name: "Maya Patel",
    email: "support@nexus.delivery",
    role: "user",
    status: "Disabled",
    activity: "Disabled by platform operator yesterday",
  },
];

const initialDocuments: DocumentTableRow[] = [
  {
    id: "doc-pod-1",
    name: "POD-2026-06-27-1042.pdf",
    merchant: "Doorway Group LTD",
    type: "Delivery Note",
    status: "Confirmed",
    uploaded: "Jun 27, 2026, 10:42",
  },
  {
    id: "doc-invoice-1",
    name: "Invoice-batch-08.pdf",
    merchant: "Nook Home",
    type: "Manifest",
    status: "Processing",
    uploaded: "Jun 27, 2026, 09:18",
  },
  {
    id: "doc-shipping-1",
    name: "Shipping-docs-warehouse-a.pdf",
    merchant: "North Hub Warehousing",
    type: "Purchase Order",
    status: "Needs Review",
    uploaded: "Jun 27, 2026, 08:05",
  },
];

const initialIntegrations = [
  {
    id: "track-pod",
    name: "Track-POD",
    status: "Connected",
    detail: "Syncing 418 stops every 2 minutes",
    action: "Test connection",
  },
  {
    id: "xero",
    name: "Xero",
    status: "Attention",
    detail: "1 invoice export retry pending",
    action: "Reconnect",
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    status: "Connected",
    detail: "Orders flowing from 3 storefronts",
    action: "Run diagnostics",
  },
  {
    id: "stripe",
    name: "Stripe",
    status: "Connected",
    detail: "Billing webhooks healthy",
    action: "Check webhooks",
  },
  {
    id: "api-keys",
    name: "API Keys",
    status: "Managed",
    detail: "2 production keys rotated this week",
    action: "Rotate key",
  },
];

const initialSubscriptions = [
  {
    id: "sub-scale",
    name: "Scale Plan",
    customers: 18,
    status: "Healthy",
    note: "2 trials converting this week",
  },
  {
    id: "sub-growth",
    name: "Growth Plan",
    customers: 11,
    status: "Watch",
    note: "1 payment retry due",
  },
  {
    id: "sub-starter",
    name: "Starter Plan",
    customers: 9,
    status: "Healthy",
    note: "4 customers close to usage threshold",
  },
];

const initialFeatureFlags = [
  { id: "dynamic-routing-beta", name: "Dynamic routing beta", enabled: true },
  { id: "proof-of-delivery-v2", name: "Proof of delivery v2", enabled: true },
  { id: "xero-auto-export", name: "Xero auto-export", enabled: false },
];

const releaseNotes = [
  {
    version: "Sprint 1",
    title: "Manage IT launched",
    summary: "Operations Centre, permissions foundation, platform controls and audit visibility delivered.",
  },
  {
    version: "Sprint 0",
    title: "Spotlight architecture",
    summary: "The Hub, Access IT, Create IT, Route IT and Track IT architecture established.",
  },
];

function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="rounded-[32px] border border-[#7C3AED]/20 bg-gradient-to-br from-[#111827] via-[#1f2937] to-[#111827] p-8 text-white shadow-[0_30px_80px_-40px_rgba(124,58,237,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#A78BFA]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">{description}</p>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const classes =
    variant === "primary"
      ? "bg-[#7C3AED] text-white hover:bg-[#6d28d9]"
      : variant === "danger"
        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function formatAuditTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ManageItControlRoom({ sectionSlug }: { sectionSlug?: ManageItSectionSlug }) {
  const router = useRouter();
  const companyId = useRuntimeCompanyId();
  const [loading, setLoading] = useState(true);
  const [accessProfile, setAccessProfile] = useState<ManageItAccessProfile | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | "Active" | "Review" | "Suspended">("all");
  const [companies] = useState(initialCompanies);
  const [teamMembers, setTeamMembers] = useState(initialTeamMembers);
  const [documents, setDocuments] = useState(initialDocuments);
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [featureFlags, setFeatureFlags] = useState(initialFeatureFlags);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>(FALLBACK_AUDIT_LOGS);

  const currentSection = sectionSlug ? getManageItSection(sectionSlug) : undefined;

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const profile = await getManageItAccessProfile();
        if (!active) return;
        setAccessProfile(profile);
        await syncManageItSession(profile.accessToken);

        if (!profile.canAccessManageIt) {
          router.replace("/");
          return;
        }
      } catch (error) {
        console.error("Manage IT bootstrap failed", error);
        router.replace("/");
        return;
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!accessProfile?.canAccessManageIt) {
      return;
    }

    const resource = currentSection?.slug ?? "home";
    void logAdminAction({
      action: "manage_it.section.view",
      resourceType: "section",
      resourceId: resource,
      details: { section: resource },
    }).catch((error) => {
      console.error("Manage IT audit log failed", error);
    });
  }, [accessProfile, currentSection]);

  useEffect(() => {
    if (sectionSlug !== "platform" || !accessProfile?.canAccessManageIt) {
      return;
    }

    let active = true;

    async function loadAuditLog() {
      try {
        const response = await fetch("/api/manage-it/audit-log?limit=12", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { data?: AuditLogEntry[] };
        if (active && payload.data?.length) {
          setAuditEntries(payload.data);
        }
      } catch (error) {
        console.error("Unable to load audit log", error);
      }
    }

    void loadAuditLog();

    return () => {
      active = false;
    };
  }, [accessProfile, sectionSlug]);

  const visibleSections = useMemo(() => {
    if (!accessProfile) {
      return [];
    }
    return getVisibleManageItSections(accessProfile);
  }, [accessProfile]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchMatch =
        customer.company.toLowerCase().includes(customerSearch.toLowerCase()) ||
        customer.sector.toLowerCase().includes(customerSearch.toLowerCase());
      const filterMatch = customerFilter === "all" ? true : customer.status === customerFilter;
      return searchMatch && filterMatch;
    });
  }, [customerFilter, customerSearch, customers]);

  if (loading) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
        Checking Manage IT permissions...
      </div>
    );
  }

  if (!accessProfile?.canAccessManageIt) {
    return (
      <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
        Manage IT is restricted to platform operators. Returning to The Hub...
      </div>
    );
  }

  if (currentSection && !hasPermission(accessProfile, currentSection.requiredPermission)) {
    return (
      <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
        You do not have permission to open this section.
      </div>
    );
  }

  const recordAction = async (
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown>,
    nextMessage: string,
    onSuccess?: () => void
  ) => {
    try {
      onSuccess?.();
      setActionMessage(nextMessage);
      await logAdminAction({ action, resourceType, resourceId, details });
    } catch (error) {
      console.error("Manage IT action failed", error);
      setActionMessage("Action captured locally, but the audit write could not be confirmed.");
    }
  };

  const renderHome = () => (
    <SectionShell
      eyebrow="Spotlight"
      title="Manage IT"
      description="Administration workspace for merchants and platform operators. Create-it stays operational while Manage-it owns users, customers, addresses, integrations and settings."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Platform operator" value={accessProfile.email ?? "Signed in"} helper={accessProfile.roles.join(", ") || "Role pending"} />
        <StatCard label="Visible sections" value={String(visibleSections.length)} helper="Permission-gated surfaces in this session" />
        <StatCard label="Today’s bookings" value="184" helper="12% ahead of yesterday’s pace" />
        <StatCard label="Queue health" value="Stable" helper="2 alerts require review" />
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Merchant Management</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Switch / Impersonate Merchant</h3>
            <p className="mt-1 text-sm text-slate-600">Jump into any merchant workspace using the existing company runtime override.</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {companies.length} merchants seeded
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.setItem("nexus.runtimeCompanyId", company.id);
                }
                router.push(`/portal?companyId=${encodeURIComponent(company.id)}`);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-[#7C3AED]/40 hover:bg-white"
            >
              <p className="text-sm font-semibold text-slate-900">{company.name}</p>
              <p className="mt-1 text-xs text-slate-500">{company.subscription} • {company.status}</p>
              <p className="mt-3 text-xs font-semibold text-[#7C3AED]">Open merchant workspace →</p>
            </button>
          ))}
        </div>
      </div>

      {actionMessage ? (
        <div className="rounded-[28px] border border-[#7C3AED]/20 bg-[#7C3AED]/5 px-5 py-4 text-sm text-slate-700 shadow-sm">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <Link
            key={section.slug}
            href={`/app/manage-it/${section.slug}`}
            className="group flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#7C3AED]/30 hover:shadow-[0_24px_80px_-48px_rgba(124,58,237,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7C3AED]">{section.eyebrow}</p>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">{section.title}</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Live</span>
            </div>
            <p className="mt-4 flex-1 text-sm leading-7 text-slate-600">{section.description}</p>
            <div className="mt-6 text-sm font-semibold text-[#7C3AED] transition group-hover:translate-x-1">Open →</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Merchant View</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Merchant Administration Menu</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {[
              "Company",
              "Users",
              "Customers",
              "Collection Addresses",
              "Pricing",
              "Document it",
              "Communicate it",
              "Notify it",
              "Integrate it",
              "Settings",
            ].map((item) => (
              <li key={item} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{item}</li>
            ))}
          </ul>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Admin View</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Platform Administration Menu</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {[
              "Merchant Management",
              "Merchant Search",
              "Switch / Impersonate Merchant",
              "Merchant Users",
              "Merchant Customers",
              "Merchant Orders",
              "Merchant Documents",
              "Merchant Integrations",
              "Platform Settings",
            ].map((item) => (
              <li key={item} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{item}</li>
            ))}
          </ul>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Permission layer</p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-950">Future-proof access control</h3>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {MANAGE_IT_SECTIONS.map((section) => (
              <div key={section.slug} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                <p className="mt-1 text-xs text-slate-500">Requires `{section.requiredPermission}`</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Operator checklist</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Permissions are resolved via role → permission mappings.</li>
            <li className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Only users with `view:manage_it` can access this Spotlight.</li>
            <li className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Admin actions emit audit events for downstream review.</li>
          </ul>
        </div>
      </div>
    </SectionShell>
  );

  const renderDashboard = () => (
    <SectionShell
      eyebrow="Operations overview"
      title="Dashboard"
      description="Live platform statistics, today’s bookings, routes, delivery status, errors and queue visibility in one operating surface."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bookings today" value="184" helper="Across all active customers" />
        <StatCard label="Routes live" value="28" helper="3 routes entering final-mile window" />
        <StatCard label="Delivery issues" value="5" helper="2 SLA alerts, 3 retries pending" />
        <StatCard label="Queue status" value="Healthy" helper="Parser queue < 30s backlog" />
      </div>
      <LiveOperationsDashboard />
    </SectionShell>
  );

  const renderCustomers = () => (
    <SectionShell
      eyebrow="Customer control"
      title="Customers"
      description="Search, filter and support customer accounts. Actions are permission-gated and every admin action is audit-ready."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
        <input
          value={customerSearch}
          onChange={(event) => setCustomerSearch(event.target.value)}
          placeholder="Search customer or sector"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
        />
        <select
          value={customerFilter}
          onChange={(event) => setCustomerFilter(event.target.value as typeof customerFilter)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Review">Review</option>
          <option value="Suspended">Suspended</option>
        </select>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          {filteredCustomers.length} customers visible
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {filteredCustomers.map((customer) => (
          <article key={customer.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{customer.company}</h3>
                <p className="mt-1 text-sm text-slate-500">{customer.sector}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{customer.status}</span>
            </div>
            <div className="mt-5 space-y-2 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Plan:</span> {customer.plan}</p>
              <p><span className="font-semibold text-slate-900">Health:</span> {customer.health}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {hasPermission(accessProfile, "manage:customers:suspend") ? (
                <ActionButton
                  variant="secondary"
                  onClick={() => {
                    void recordAction(
                      "manage_it.customer.suspend",
                      "customer",
                      customer.id,
                      { company: customer.company },
                      `${customer.company} status updated.`,
                      () => {
                        setCustomers((current) =>
                          current.map((entry) =>
                            entry.id === customer.id
                              ? { ...entry, status: entry.status === "Suspended" ? "Active" : "Suspended" }
                              : entry
                          )
                        );
                      }
                    );
                  }}
                >
                  {customer.status === "Suspended" ? "Restore" : "Suspend"}
                </ActionButton>
              ) : null}
              {hasPermission(accessProfile, "manage:customers:delete") ? (
                <ActionButton
                  variant="danger"
                  onClick={() => {
                    void recordAction(
                      "manage_it.customer.delete",
                      "customer",
                      customer.id,
                      { company: customer.company },
                      `${customer.company} removed from the local queue.`,
                      () => {
                        setCustomers((current) => current.filter((entry) => entry.id !== customer.id));
                      }
                    );
                  }}
                >
                  Delete
                </ActionButton>
              ) : null}
              {hasPermission(accessProfile, "manage:customers:impersonate") ? (
                <ActionButton
                  onClick={() => {
                    void recordAction(
                      "manage_it.customer.impersonate",
                      "customer",
                      customer.id,
                      { company: customer.company },
                      `Impersonation handoff prepared for ${customer.company}.`
                    );
                  }}
                >
                  Impersonate
                </ActionButton>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const renderCompanies = () => (
    <SectionShell
      eyebrow="Tenant control"
      title="Companies"
      description="Review company profile, logo, subscription state and usage from a single premium control surface."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {companies.map((company) => (
          <article key={company.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#7C3AED] text-lg font-semibold text-white shadow-sm shadow-[#7C3AED]/30">
                {company.logo}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{company.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{company.subscription} • {company.status}</p>
              </div>
            </div>
            <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">{company.usage}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton
                variant="secondary"
                disabled={!hasPermission(accessProfile, "manage:companies:edit")}
                onClick={() => {
                  void recordAction(
                    "manage_it.company.edit",
                    "company",
                    company.id,
                    { company: company.name },
                    `${company.name} is ready for editing.`
                  );
                }}
              >
                Edit company
              </ActionButton>
              <ActionButton
                disabled={!hasPermission(accessProfile, "manage:companies:manage_subscription")}
                onClick={() => {
                  void recordAction(
                    "manage_it.company.manage_subscription",
                    "company",
                    company.id,
                    { company: company.name },
                    `${company.name} subscription workflow opened.`
                  );
                }}
              >
                Manage subscription
              </ActionButton>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const renderDocumentCentre = () => (
    <SectionShell
      eyebrow="Document operations"
      title="Document Centre"
      description="Upload PODs, invoices and shipping documents into the same operational pipeline used across the platform."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="POD backlog" value="12" helper="Needs operator review" />
        <StatCard label="Invoices queued" value="7" helper="Awaiting accounting sync" />
        <StatCard label="Shipping docs" value="24" helper="Ready for route planning" />
        <StatCard label="Upload SLA" value="29s" helper="Average ingest time" />
      </div>

      <DocumentUploadCard
        companyId={companyId}
        onUploadComplete={(fileName) => {
          setDocuments((current) => [
            {
              id: createLocalId("doc"),
              name: fileName,
              merchant: "Manage IT Upload",
              type: "Delivery Note",
              status: "Uploaded",
              uploaded: new Date().toLocaleString(),
            },
            ...current,
          ]);
        }}
      />

      <DocumentsTable documents={documents} />
    </SectionShell>
  );

  const renderSettings = () => (
    <SectionShell
      eyebrow="Configuration"
      title="Settings"
      description="Account settings, company defaults, tenant controls and feature configuration aligned to the rest of The Hub."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "Account settings", body: "Session policy, operator preferences and support escalation defaults." },
          { title: "Company settings", body: "Default logos, contact routing, POD rules and company-wide notifications." },
          { title: "Tenant controls", body: "Onboarding defaults, document retention and customer environment safeguards." },
        ].map((item) => (
          <div key={item.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
            <div className="mt-5">
              <ActionButton disabled={!hasPermission(accessProfile, "manage:settings:edit")}>Update</ActionButton>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );

  const renderTeamManagement = () => (
    <SectionShell
      eyebrow="Identity & access"
      title="Team Management"
      description="Invite users, reset passwords, assign roles, disable access and review operator activity through the permission layer."
    >
      <form
        className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:grid-cols-[1fr_220px_auto]"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (!inviteEmail.trim()) {
            return;
          }

          const email = inviteEmail.trim();
          void recordAction(
            "manage_it.team.invite",
            "user",
            email,
            { email, role: inviteRole },
            `Invite prepared for ${email}.`,
            () => {
              setTeamMembers((current) => [
                {
                  id: createLocalId("team"),
                  name: email.split("@")[0],
                  email,
                  role: inviteRole,
                  status: "Invited",
                  activity: "Invitation queued just now",
                },
                ...current,
              ]);
              setInviteEmail("");
              setInviteRole("user");
            }
          );
        }}
      >
        <input
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          placeholder="invite@nexus.delivery"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <select
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
        >
          <option value="user">User</option>
          <option value="company_admin">Company Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <ActionButton disabled={!hasPermission(accessProfile, "manage:users:invite")}>Invite user</ActionButton>
      </form>

      <div className="grid gap-4 xl:grid-cols-3">
        {teamMembers.map((member) => (
          <article key={member.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{member.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{member.email}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{member.role}</span>
            </div>
            <p className="mt-4 text-sm text-slate-600">{member.activity}</p>
            <p className="mt-2 text-sm font-medium text-slate-900">Status: {member.status}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton
                variant="secondary"
                disabled={!hasPermission(accessProfile, "manage:users:reset_password")}
                onClick={() => {
                  void recordAction(
                    "manage_it.team.reset_password",
                    "user",
                    member.id,
                    { email: member.email },
                    `Password reset prepared for ${member.email}.`
                  );
                }}
              >
                Reset password
              </ActionButton>
              <ActionButton
                disabled={!hasPermission(accessProfile, "manage:users:assign_roles")}
                onClick={() => {
                  void recordAction(
                    "manage_it.team.assign_role",
                    "user",
                    member.id,
                    { email: member.email },
                    `${member.email} role changed locally.`,
                    () => {
                      setTeamMembers((current) =>
                        current.map((entry) =>
                          entry.id === member.id
                            ? {
                                ...entry,
                                role:
                                  entry.role === "user"
                                    ? "company_admin"
                                    : entry.role === "company_admin"
                                      ? "super_admin"
                                      : "user",
                              }
                            : entry
                        )
                      );
                    }
                  );
                }}
              >
                Cycle role
              </ActionButton>
              <ActionButton
                variant="danger"
                disabled={!hasPermission(accessProfile, "manage:users:disable")}
                onClick={() => {
                  void recordAction(
                    "manage_it.team.disable",
                    "user",
                    member.id,
                    { email: member.email },
                    `${member.email} access updated.`,
                    () => {
                      setTeamMembers((current) =>
                        current.map((entry) =>
                          entry.id === member.id
                            ? { ...entry, status: entry.status === "Disabled" ? "Active" : "Disabled" }
                            : entry
                        )
                      );
                    }
                  );
                }}
              >
                {member.status === "Disabled" ? "Restore" : "Disable"}
              </ActionButton>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const renderIntegrations = () => (
    <SectionShell
      eyebrow="Connected systems"
      title="Integrations"
      description="Track-POD, Xero, WooCommerce, Stripe and API key health in one control layer."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {integrations.map((integration) => (
          <article key={integration.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{integration.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{integration.detail}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{integration.status}</span>
            </div>
            <div className="mt-5 flex gap-2">
              <ActionButton
                disabled={!hasPermission(accessProfile, "manage:integrations:connect")}
                onClick={() => {
                  void recordAction(
                    "manage_it.integration.action",
                    "integration",
                    integration.id,
                    { integration: integration.name },
                    `${integration.name} check completed.`,
                    () => {
                      setIntegrations((current) =>
                        current.map((entry) =>
                          entry.id === integration.id
                            ? { ...entry, status: entry.status === "Attention" ? "Connected" : entry.status }
                            : entry
                        )
                      );
                    }
                  );
                }}
              >
                {integration.action}
              </ActionButton>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const renderSubscriptions = () => (
    <SectionShell
      eyebrow="Billing operations"
      title="Subscriptions"
      description="Plans, trials, billing state and Stripe readiness presented as a premium operations surface."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {initialSubscriptions.map((subscription) => (
          <article key={subscription.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <h3 className="text-lg font-semibold text-slate-950">{subscription.name}</h3>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{subscription.customers}</p>
            <p className="text-sm text-slate-500">customers on this plan</p>
            <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Status: {subscription.status}</p>
              <p className="mt-2">{subscription.note}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const renderPlatform = () => (
    <SectionShell
      eyebrow="Platform controls"
      title="Platform"
      description="Feature flags, environment information, release notes and the audit trail for permission-based operations."
    >
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Feature flags</p>
            <div className="mt-4 space-y-3">
              {featureFlags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{flag.name}</p>
                    <p className="text-xs text-slate-500">{flag.id}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!hasPermission(accessProfile, "manage:platform:feature_flags")}
                    onClick={() => {
                      void recordAction(
                        "manage_it.feature_flag.toggle",
                        "feature_flag",
                        flag.id,
                        { enabled: !flag.enabled },
                        `${flag.name} toggled locally.`,
                        () => {
                          setFeatureFlags((current) =>
                            current.map((entry) =>
                              entry.id === flag.id ? { ...entry, enabled: !entry.enabled } : entry
                            )
                          );
                        }
                      );
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      flag.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {flag.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Environment</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Runtime: Next.js 16 App Router</div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Auth: Supabase session + permission cookie sync</div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">Theme: The Hub dark + purple Spotlight language</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Release notes</p>
            <div className="mt-4 space-y-3">
              {releaseNotes.map((note) => (
                <div key={note.version} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{note.version} · {note.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{note.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Audit log</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Operator actions</h3>
            </div>
            <span className="rounded-full bg-[#7C3AED]/10 px-3 py-1 text-xs font-semibold text-[#7C3AED]">
              {auditEntries.length} recent events
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.actorEmail} • {entry.resourceType}
                      {entry.resourceId ? ` • ${entry.resourceId}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{formatAuditTime(entry.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );

  switch (sectionSlug) {
    case undefined:
      return renderHome();
    case "dashboard":
      return renderDashboard();
    case "customers":
      return renderCustomers();
    case "companies":
      return renderCompanies();
    case "document-centre":
      return renderDocumentCentre();
    case "settings":
      return renderSettings();
    case "team-management":
      return renderTeamManagement();
    case "integrations":
      return renderIntegrations();
    case "subscriptions":
      return renderSubscriptions();
    case "platform":
      return renderPlatform();
    default:
      return renderHome();
  }
}
