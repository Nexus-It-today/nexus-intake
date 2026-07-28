"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MerchantCustomersManager from "@/components/MerchantCustomersManager";
import CustomerAddressesManager from "@/components/CustomerAddressesManager";
import CollectionAddressesManager from "@/components/CollectionAddressesManager";

type MerchantStatus = "active" | "disabled" | "archived";

type MerchantRow = {
  id: string;
  merchantName: string;
  company: string;
  contact: string;
  email: string;
  telephone: string;
  status: MerchantStatus;
  activeOrders: number;
  totalOrders: number;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceData = {
  merchant: {
    id: string;
    name: string;
    trading_name: string | null;
    business_type: string | null;
    created_at: string;
    updated_at: string;
  };
  users: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    created_at: string;
  }>;
  documents: Array<{
    id: string;
    file_name: string | null;
    document_type: string | null;
    status: string | null;
    created_at: string;
  }>;
  counts: {
    customers: number;
    users: number;
    documents: number;
    activeOrders: number;
    totalOrders: number;
  };
  recentActivity: Array<{
    id: string;
    createdAt: string;
    label: string;
    detail: string;
  }>;
  recentOrders: Array<{
    id: string;
    job_reference: string | null;
    external_order_id: string | null;
    customer: string | null;
    collection_company: string | null;
    delivery_company: string | null;
    lifecycle_status: string | null;
    status: string | null;
    created_at: string;
  }>;
};

type MerchantResponse = {
  merchants: MerchantRow[];
  total: number;
  page: number;
  pageSize: number;
  canDelete: boolean;
  error?: string;
};

const DEFAULT_PAGE_SIZE = 10;

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function fmt(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : "-";
}

function statusLabel(status: MerchantStatus): string {
  if (status === "active") return "Active";
  if (status === "disabled") return "Disabled";
  return "Archived";
}

function statusBadgeClass(status: MerchantStatus): string {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (status === "disabled") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

export default function MerchantManagementBoard({ title = "Merchant Management", embedded = false }: { title?: string; embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryMerchantId = searchParams.get("merchantId")?.trim() ?? "";

  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | MerchantStatus>("all");
  const [sortBy, setSortBy] = useState<"merchantName" | "company" | "status" | "activeOrders" | "createdAt">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceData | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editMerchant, setEditMerchant] = useState<MerchantRow | null>(null);
  const [formMerchantName, setFormMerchantName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formBusinessType, setFormBusinessType] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTelephone, setFormTelephone] = useState("");
  const [formStatus, setFormStatus] = useState<MerchantStatus>("active");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadMerchants = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });

      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);

      const response = await fetch(`/api/manage-it/merchants?${params.toString()}`, {
        headers: await authHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as MerchantResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load merchants (${response.status})`);
      }

      setMerchants(payload.merchants ?? []);
      setTotal(payload.total ?? 0);
      setCanDelete(Boolean(payload.canDelete));

      if (queryMerchantId) {
        setSelectedMerchantId(queryMerchantId);
      } else if (!selectedMerchantId && payload.merchants?.length) {
        setSelectedMerchantId(payload.merchants[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load merchants");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, queryMerchantId, search, selectedMerchantId, sortBy, sortDir, status]);

  const loadWorkspace = useCallback(async (merchantId: string) => {
    if (!merchantId) {
      setSelectedWorkspace(null);
      return;
    }

    setWorkspaceLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/manage-it/merchants/${encodeURIComponent(merchantId)}/workspace`, {
        headers: await authHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as WorkspaceData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load merchant workspace (${response.status})`);
      }
      setSelectedWorkspace(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load merchant workspace");
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMerchants();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMerchants]);

  useEffect(() => {
    if (!selectedMerchantId) {
      const timer = window.setTimeout(() => {
        setSelectedWorkspace(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void loadWorkspace(selectedMerchantId);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadWorkspace, selectedMerchantId]);

  async function submitCreate() {
    if (!formMerchantName.trim()) {
      setError("Merchant name is required.");
      return;
    }

    try {
      setError(null);
      const response = await fetch("/api/manage-it/merchants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          merchantName: formMerchantName,
          company: formCompany,
          businessType: formBusinessType,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        merchant?: MerchantRow;
      };

      if (!response.ok || !payload.merchant) {
        throw new Error(payload.error ?? "Failed to create merchant");
      }

      setCreateOpen(false);
      setFormMerchantName("");
      setFormCompany("");
      setFormBusinessType("");
      setMessage(`Merchant created: ${payload.merchant.merchantName}`);
      setSelectedMerchantId(payload.merchant.id);
      setPage(1);
      await loadMerchants();
      await loadWorkspace(payload.merchant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create merchant");
    }
  }

  async function runMerchantAction(merchantId: string, action: "archive" | "restore" | "disable" | "enable") {
    try {
      setError(null);
      const response = await fetch(`/api/manage-it/merchants/${encodeURIComponent(merchantId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ action }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Merchant action failed");
      }

      setMessage(`Merchant updated: ${action}`);
      await loadMerchants();
      if (selectedMerchantId) {
        await loadWorkspace(selectedMerchantId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merchant action failed");
    }
  }

  async function submitEdit() {
    if (!editMerchant) return;
    if (!formMerchantName.trim()) {
      setError("Merchant name is required.");
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/manage-it/merchants/${encodeURIComponent(editMerchant.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          action: "edit",
          merchantName: formMerchantName,
          company: formCompany,
          businessType: formBusinessType,
          status: formStatus,
          contactName: formContactName,
          email: formEmail,
          telephone: formTelephone,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update merchant");
      }

      setEditMerchant(null);
      setMessage("Merchant updated.");
      await loadMerchants();
      await loadWorkspace(selectedMerchantId || editMerchant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update merchant");
    }
  }

  async function deleteMerchant(id: string) {
    const confirmed = window.confirm("Delete this merchant? This only works if there are no linked users, customers, or orders.");
    if (!confirmed) return;

    try {
      setError(null);
      const response = await fetch(`/api/manage-it/merchants/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Delete failed");
      }

      setMessage("Merchant deleted.");
      if (selectedMerchantId === id) {
        setSelectedMerchantId("");
        setSelectedWorkspace(null);
      }
      await loadMerchants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function exportCsv() {
    const headers = [
      "Merchant Name",
      "Company",
      "Contact",
      "Email",
      "Telephone",
      "Status",
      "Active Orders",
      "Created Date",
    ];

    const rows = merchants.map((merchant) => [
      merchant.merchantName,
      merchant.company,
      merchant.contact,
      merchant.email,
      merchant.telephone,
      statusLabel(merchant.status),
      String(merchant.activeOrders),
      fmt(merchant.createdAt),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((entry) => `"${String(entry).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "merchants.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importCsv(input: string) {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      setError("CSV import requires a header row and at least one merchant row.");
      return;
    }

    const rows = lines.slice(1);
    let processed = 0;

    void (async () => {
      for (const row of rows) {
        const columns = row.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
        const [merchantName, company] = columns;
        if (!merchantName) continue;

        const response = await fetch("/api/manage-it/merchants", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({ merchantName, company }),
        });
        if (response.ok) {
          processed += 1;
        }
      }

      setMessage(`Imported ${processed} merchant${processed === 1 ? "" : "s"}.`);
      await loadMerchants();
    })();
  }

  const selectedMerchantName = useMemo(() => {
    return selectedWorkspace?.merchant.name ?? merchants.find((merchant) => merchant.id === selectedMerchantId)?.merchantName ?? "";
  }, [merchants, selectedMerchantId, selectedWorkspace?.merchant.name]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Oversee it</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Search merchants, manage status, open merchant workspaces, and run operational actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCreateOpen(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">Create Merchant</button>
            <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Import Merchant
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    importCsv(String(reader.result ?? ""));
                  };
                  reader.readAsText(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button onClick={exportCsv} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Export</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search merchants"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "all" | MerchantStatus);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="archived">Archived</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="createdAt">Created Date</option>
            <option value="merchantName">Merchant Name</option>
            <option value="company">Company</option>
            <option value="status">Status</option>
            <option value="activeOrders">Active Orders</option>
          </select>
          <button onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Sort: {sortDir.toUpperCase()}
          </button>
          <button onClick={() => void loadMerchants()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Search</button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Merchant Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Company</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Contact</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Email</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Telephone</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Active Orders</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Created Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">Loading merchants...</td>
                </tr>
              ) : merchants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">No merchants found.</td>
                </tr>
              ) : (
                merchants.map((merchant) => (
                  <tr key={merchant.id} className={selectedMerchantId === merchant.id ? "bg-blue-50" : ""}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{merchant.merchantName}</td>
                    <td className="px-3 py-2 text-slate-700">{merchant.company || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{merchant.contact || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{merchant.email || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{merchant.telephone || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(merchant.status)}`}>
                        {statusLabel(merchant.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{merchant.activeOrders}</td>
                    <td className="px-3 py-2 text-slate-700">{fmt(merchant.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedMerchantId(merchant.id);
                            router.push(`/app/manage-it?merchantId=${encodeURIComponent(merchant.id)}`);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            setEditMerchant(merchant);
                            setFormMerchantName(merchant.merchantName);
                            setFormCompany(merchant.company || "");
                            setFormBusinessType("");
                            setFormContactName(merchant.contact || "");
                            setFormEmail(merchant.email || "");
                            setFormTelephone(merchant.telephone || "");
                            setFormStatus(merchant.status);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          Edit
                        </button>
                        {merchant.status === "archived" ? (
                          <button onClick={() => void runMerchantAction(merchant.id, "restore")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Restore</button>
                        ) : (
                          <button onClick={() => void runMerchantAction(merchant.id, "archive")} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Archive</button>
                        )}
                        {merchant.status === "disabled" ? (
                          <button onClick={() => void runMerchantAction(merchant.id, "enable")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Enable</button>
                        ) : (
                          <button onClick={() => void runMerchantAction(merchant.id, "disable")} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Disable</button>
                        )}
                        {canDelete ? (
                          <button onClick={() => void deleteMerchant(merchant.id)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Delete</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Merchant Workspace</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">{selectedMerchantName || "Select a merchant"}</h3>
          </div>
          {selectedMerchantId ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <Link href={`/orders?companyId=${encodeURIComponent(selectedMerchantId)}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">Orders</Link>
              <Link href={`/process-it?companyId=${encodeURIComponent(selectedMerchantId)}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">Process it</Link>
              <Link href={`/app/manage-it/search-it?q=${encodeURIComponent(selectedMerchantName || "")}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">Search</Link>
            </div>
          ) : null}
        </div>

        {!selectedMerchantId ? (
          <p className="mt-4 text-sm text-slate-500">Select a merchant from the table to open workspace details.</p>
        ) : workspaceLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading workspace...</p>
        ) : !selectedWorkspace ? (
          <p className="mt-4 text-sm text-slate-500">Workspace not available.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Active Orders" value={String(selectedWorkspace.counts.activeOrders)} />
              <StatCard label="Customers" value={String(selectedWorkspace.counts.customers)} />
              <StatCard label="Users" value={String(selectedWorkspace.counts.users)} />
              <StatCard label="Documents" value={String(selectedWorkspace.counts.documents)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Merchant Details</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <p>Name: {selectedWorkspace.merchant.name}</p>
                  <p>Company: {selectedWorkspace.merchant.trading_name || "-"}</p>
                  <p>Business Type: {selectedWorkspace.merchant.business_type || "-"}</p>
                  <p>Created: {fmt(selectedWorkspace.merchant.created_at)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Users</p>
                {selectedWorkspace.users.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No users linked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {selectedWorkspace.users.slice(0, 6).map((user) => (
                      <li key={user.id}>{user.full_name || user.email || user.id} · {user.role || "user"}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Recent activity</p>
                {selectedWorkspace.recentActivity.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No activity yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selectedWorkspace.recentActivity.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">{entry.label}</p>
                        <p>{entry.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Last 10 orders</p>
                {selectedWorkspace.recentOrders.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No recent orders.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedWorkspace.recentOrders.map((order) => (
                      <div key={order.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-900">{order.job_reference || order.external_order_id || order.id}</p>
                          <span className="text-xs text-slate-500">{fmt(order.created_at)}</span>
                        </div>
                        <p className="text-slate-700">{order.customer || "-"} · {order.lifecycle_status || order.status || "-"}</p>
                        <div className="mt-2 flex gap-1.5">
                          <Link href={`/orders?orderId=${encodeURIComponent(order.id)}&companyId=${encodeURIComponent(selectedMerchantId)}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">View</Link>
                          <Link href={`/orders?orderId=${encodeURIComponent(order.id)}&edit=1&companyId=${encodeURIComponent(selectedMerchantId)}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Edit</Link>
                          <button
                            onClick={async () => {
                              const response = await fetch("/api/process-it/archive", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(await authHeaders()),
                                },
                                body: JSON.stringify({ draftJobId: order.id }),
                              });
                              if (response.ok) {
                                setMessage(`Order archived: ${order.job_reference || order.id}`);
                                await loadWorkspace(selectedMerchantId);
                              }
                            }}
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Link href={`/app/manage-it/search-it?q=${encodeURIComponent(selectedWorkspace.merchant.name)}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Documents</Link>
              <Link href={`/app/manage-it/search-it?q=${encodeURIComponent(selectedWorkspace.merchant.name + " user")}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Users</Link>
              <Link href={`/app/manage-it/search-it?q=${encodeURIComponent(selectedWorkspace.merchant.name + " address")}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Addresses</Link>
              <Link href={`/settings?companyId=${encodeURIComponent(selectedMerchantId)}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Settings</Link>
            </div>
          </div>
        )}
      </section>

      {embedded && selectedMerchantName ? (
        <>
          <MerchantCustomersManager activeWorkspaceName={selectedMerchantName} activeWorkspaceCompanyId={selectedMerchantId} />
          <CustomerAddressesManager activeWorkspaceName={selectedMerchantName} activeWorkspaceCompanyId={selectedMerchantId} />
          <CollectionAddressesManager activeWorkspaceName={selectedMerchantName} activeWorkspaceCompanyId={selectedMerchantId} />
        </>
      ) : null}

      {createOpen ? (
        <Modal title="Create Merchant" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3">
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <input value={formMerchantName} onChange={(event) => setFormMerchantName(event.target.value)} placeholder="Merchant Name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formCompany} onChange={(event) => setFormCompany(event.target.value)} placeholder="Company" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formBusinessType} onChange={(event) => setFormBusinessType(event.target.value)} placeholder="Business Type" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={() => void submitCreate()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">Create Merchant</button>
          </div>
        </Modal>
      ) : null}

      {editMerchant ? (
        <Modal title={`Edit ${editMerchant.merchantName}`} onClose={() => setEditMerchant(null)}>
          <div className="space-y-3">
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <input value={formMerchantName} onChange={(event) => setFormMerchantName(event.target.value)} placeholder="Merchant Name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formCompany} onChange={(event) => setFormCompany(event.target.value)} placeholder="Company" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formBusinessType} onChange={(event) => setFormBusinessType(event.target.value)} placeholder="Business Type" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formContactName} onChange={(event) => setFormContactName(event.target.value)} placeholder="Contact Name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formEmail} onChange={(event) => setFormEmail(event.target.value)} placeholder="Email" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={formTelephone} onChange={(event) => setFormTelephone(event.target.value)} placeholder="Telephone" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={formStatus} onChange={(event) => setFormStatus(event.target.value as MerchantStatus)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </select>
            <button onClick={() => void submitEdit()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">Save</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
