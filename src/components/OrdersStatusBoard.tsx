"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { DashboardDetail, DashboardRow } from "@/lib/orders/dashboard";

type OrdersStatusBoardProps = {
  scope: "admin" | "merchant";
  title: string;
  subtitle: string;
};

type DashboardResponse = {
  jobs: DashboardRow[];
  total: number;
  scope: "admin" | "merchant";
  error?: string;
};

type DatePreset = "today" | "last7" | "last30" | "custom";

function badgeClass(status: string): string {
  const val = status.toLowerCase();
  if (val.includes("delivered") || val.includes("sent")) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (val.includes("failed") || val.includes("issue") || val.includes("error")) {
    return "bg-red-50 text-red-700 border border-red-200";
  }
  if (val.includes("review")) {
    return "bg-amber-50 text-amber-700 border border-amber-200";
  }
  if (val.includes("collect") || val.includes("route")) {
    return "bg-blue-50 text-blue-700 border border-blue-200";
  }
  return "bg-slate-50 text-slate-700 border border-slate-200";
}

function toLocale(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "-";
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default function OrdersStatusBoard(props: OrdersStatusBoardProps) {
  const searchParams = useSearchParams();
  const querySelectedId = searchParams.get("orderId")?.trim() ?? searchParams.get("selected")?.trim() ?? "";
  const queryEdit = searchParams.get("edit") === "1";
  const queryStatus = searchParams.get("status")?.trim() ?? "";
  const queryCompanyId = searchParams.get("companyId")?.trim() ?? "";
  const queryWindow = searchParams.get("window")?.trim() ?? "today";
  const [jobs, setJobs] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [merchant, setMerchant] = useState("");
  const [status, setStatus] = useState(() => queryStatus);
  const [companyIdFilter, setCompanyIdFilter] = useState(() => queryCompanyId);
  const [datePreset, setDatePreset] = useState<DatePreset>(() => {
    if (queryWindow === "last7" || queryWindow === "last30" || queryWindow === "custom") return queryWindow;
    return "today";
  });
  const [fromDate, setFromDate] = useState(() => toDateInputValue(new Date()));
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [salesChannel, setSalesChannel] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DashboardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sendingToProcessId, setSendingToProcessId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    externalOrderReference: "",
    collectionName: "",
    collectionAddress: "",
    collectionPostcode: "",
    collectionPhone: "",
    collectionEmail: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryPostcode: "",
    deliveryPhone: "",
    deliveryEmail: "",
    goodsDescription: "",
    quantity: "",
    packageType: "",
    packageCount: "",
    palletCount: "",
    volume: "",
    dimensions: "",
    weightKg: "",
    requestedCollectionDate: "",
    requestedDeliveryDate: "",
    notes: "",
  });

  function primeEditForm(job: DashboardRow, detail: DashboardDetail | null) {
    setEditForm({
      externalOrderReference: job.externalOrderReference || "",
      collectionName: job.collectionName || "",
      collectionAddress: job.collectionAddress || "",
      collectionPostcode: job.collectionPostcode || "",
      collectionPhone: detail?.collection.phone || "",
      collectionEmail: detail?.collection.email || "",
      deliveryName: job.deliveryName || "",
      deliveryAddress: job.deliveryAddress || "",
      deliveryPostcode: job.deliveryPostcode || "",
      deliveryPhone: detail?.delivery.phone || "",
      deliveryEmail: detail?.delivery.email || "",
      goodsDescription: detail?.goods.description || "",
      quantity: detail?.goods.quantity || "",
      packageType: "",
      packageCount: detail?.goods.packages || "",
      palletCount: detail?.goods.palletCount || "",
      volume: "",
      dimensions: "",
      weightKg: detail?.goods.weightKg || "",
      requestedCollectionDate: job.requestedCollectionDate || "",
      requestedDeliveryDate: job.requestedDeliveryDate || "",
      notes: detail?.operations.notes || "",
    });
  }

  const dateRange = useMemo(() => {
    const today = new Date();
    if (datePreset === "today") {
      const value = toDateInputValue(today);
      return { from: value, to: value };
    }
    if (datePreset === "last7") {
      return { from: toDateInputValue(shiftDays(today, -6)), to: toDateInputValue(today) };
    }
    if (datePreset === "last30") {
      return { from: toDateInputValue(shiftDays(today, -29)), to: toDateInputValue(today) };
    }
    return { from: fromDate.trim(), to: toDate.trim() };
  }, [datePreset, fromDate, toDate]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("scope", props.scope);
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    if (props.scope === "admin" && companyIdFilter.trim()) params.set("companyId", companyIdFilter.trim());
    params.set("limit", "300");
    return params.toString();
  }, [companyIdFilter, dateRange.from, dateRange.to, props.scope]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatus(queryStatus);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCompanyIdFilter(queryCompanyId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryCompanyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (queryWindow === "last7" || queryWindow === "last30" || queryWindow === "custom") {
        setDatePreset(queryWindow);
      } else {
        setDatePreset("today");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryWindow]);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!supabase) {
        throw new Error("Supabase client is unavailable");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        throw new Error("Please sign in to view orders");
      }

      const response = await fetch(`/api/orders/dashboard?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json()) as DashboardResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load orders (${response.status})`);
      }

      setJobs(payload.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      setSelectedId(id);
      if (!supabase) {
        throw new Error("Supabase client is unavailable");
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Please sign in to view order detail");
      }

      const response = await fetch(`/api/orders/dashboard/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json()) as { detail?: DashboardDetail; error?: string };
      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? `Failed to load order detail (${response.status})`);
      }

      setSelectedDetail(payload.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const archiveOrder = useCallback(async (id: string) => {
    try {
      if (!supabase) throw new Error("Supabase client is unavailable");
      setArchivingId(id);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to archive orders");

      const response = await fetch("/api/process-it/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ draftJobId: id }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to archive order (${response.status})`);
      }

      setSelectedId(null);
      setSelectedDetail(null);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive order");
    } finally {
      setArchivingId(null);
    }
  }, [loadJobs]);

  const sendToProcess = useCallback(async (id: string) => {
    try {
      if (!supabase) throw new Error("Supabase client is unavailable");
      setSendingToProcessId(id);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to continue");

      const response = await fetch(`/api/orders/dashboard/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "send_to_process" }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        missingFields?: string[];
      };
      if (!response.ok) {
        const missing = Array.isArray(payload.missingFields) && payload.missingFields.length > 0
          ? ` Missing: ${payload.missingFields.join(", ")}`
          : "";
        throw new Error((payload.error ?? `Failed to send to Process It (${response.status})`) + missing);
      }

      await loadJobs();
      if (selectedId === id) {
        await loadDetail(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send to Process It");
    } finally {
      setSendingToProcessId(null);
    }
  }, [loadDetail, loadJobs, selectedId]);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    try {
      if (!supabase) throw new Error("Supabase client is unavailable");
      setSavingEdit(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to edit orders");

      const response = await fetch(`/api/orders/dashboard/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to update order (${response.status})`);
      }

      setEditingId(null);
      await loadJobs();
      await loadDetail(editingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSavingEdit(false);
    }
  }, [editForm, editingId, loadDetail, loadJobs]);

  const filteredJobs = useMemo(() => {
    const orderNeedle = orderNumber.trim().toLowerCase();
    const customerNeedle = customer.trim().toLowerCase();
    const postcodeNeedle = postcode.trim().toLowerCase();
    const addressNeedle = address.trim().toLowerCase();
    const merchantNeedle = merchant.trim().toLowerCase();
    const statusNeedle = status.trim().toLowerCase();
    const salesChannelNeedle = salesChannel.trim().toLowerCase();

    return jobs.filter((job) => {
      if (statusNeedle && job.lifecycleStatus.toLowerCase() !== statusNeedle) return false;
      if (orderNeedle) {
        const haystack = [job.internalOrderNumber, job.externalOrderReference].join(" ").toLowerCase();
        if (!haystack.includes(orderNeedle)) return false;
      }
      if (customerNeedle && ![job.customerMerchant, job.collectionName, job.deliveryName].join(" ").toLowerCase().includes(customerNeedle)) {
        return false;
      }
      if (postcodeNeedle && ![job.collectionPostcode, job.deliveryPostcode].join(" ").toLowerCase().includes(postcodeNeedle)) {
        return false;
      }
      if (addressNeedle && ![job.collectionAddress, job.deliveryAddress].join(" ").toLowerCase().includes(addressNeedle)) {
        return false;
      }
      if (merchantNeedle && !job.merchantName.toLowerCase().includes(merchantNeedle)) return false;
      if (salesChannelNeedle && !job.salesChannelName.toLowerCase().includes(salesChannelNeedle)) return false;
      return true;
    });
  }, [address, customer, jobs, merchant, orderNumber, postcode, salesChannel, status]);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [currentPage, filteredJobs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  useEffect(() => {
    if (!querySelectedId || jobs.length === 0) return;
    if (selectedId === querySelectedId) return;
    const timer = window.setTimeout(() => {
      void loadDetail(querySelectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [jobs, loadDetail, querySelectedId, selectedId]);

  useEffect(() => {
    if (!queryEdit || !querySelectedId || !selectedDetail || selectedId !== querySelectedId) return;
    const job = jobs.find((entry) => entry.id === querySelectedId);
    if (!job) return;
    const timer = window.setTimeout(() => {
      primeEditForm(job, selectedDetail);
      setEditingId(querySelectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [jobs, queryEdit, querySelectedId, selectedDetail, selectedId]);

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Orders</p>
          <h2 className="text-2xl font-semibold text-slate-950">{props.title}</h2>
          <p className="text-sm text-slate-600">{props.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Today", value: "today" },
          { label: "Last 7 days", value: "last7" },
          { label: "Last 30 days", value: "last30" },
          { label: "Custom range", value: "custom" },
        ].map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              setDatePreset(preset.value as DatePreset);
              setPage(1);
            }}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-semibold " +
              (datePreset === preset.value
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700")
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input
          value={orderNumber}
          onChange={(event) => {
            setOrderNumber(event.target.value);
            setPage(1);
          }}
          placeholder="Order number or ref"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        />
        <input
          value={customer}
          onChange={(event) => {
            setCustomer(event.target.value);
            setPage(1);
          }}
          placeholder="Customer"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        >
          <option value="">All statuses</option>
          <option value="Created">Created</option>
          <option value="Ready for Operations">Ready for Operations</option>
          <option value="Needs Review">Needs Review</option>
          <option value="Ready for Route">Ready for Route</option>
          <option value="Sent to Track-POD">Sent to Track-POD</option>
          <option value="Failed to send to Track-POD">Failed to send to Track-POD</option>
          <option value="Collected">Collected</option>
          <option value="Delivered">Delivered</option>
          <option value="Failed / issue">Failed / issue</option>
        </select>
        <input
          value={postcode}
          onChange={(event) => {
            setPostcode(event.target.value);
            setPage(1);
          }}
          placeholder="Postcode"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        />
        <input
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setPage(1);
          }}
          placeholder="Address"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        />
        <input
          value={salesChannel}
          onChange={(event) => {
            setSalesChannel(event.target.value);
            setPage(1);
          }}
          placeholder="Sales channel"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        />
        {props.scope === "admin" ? (
          <>
            <input
              value={merchant}
              onChange={(event) => {
                setMerchant(event.target.value);
                setPage(1);
              }}
              placeholder="Merchant"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <input
              value={companyIdFilter}
              onChange={(event) => {
                setCompanyIdFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Merchant company id"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </>
        ) : null}
        {datePreset === "custom" ? (
          <>
            <input
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <input
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </>
        ) : null}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading orders...</p>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No orders matched your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Order #</th>
                {props.scope === "admin" ? (
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Merchant</th>
                ) : null}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">External Ref</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Collection</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Delivery</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Lifecycle</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Track-POD</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Created</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Updated</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {pagedJobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{job.internalOrderNumber || "-"}</td>
                  {props.scope === "admin" ? (
                    <td className="px-3 py-2 text-slate-700">{job.merchantName || "-"}</td>
                  ) : null}
                  <td className="px-3 py-2 text-slate-600">{job.externalOrderReference || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{job.customerMerchant || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="font-medium">{job.collectionName || "-"}</div>
                    <div className="text-xs text-slate-500">{job.collectionPostcode || "-"}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="font-medium">{job.deliveryName || "-"}</div>
                    <div className="text-xs text-slate-500">{job.deliveryPostcode || "-"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(job.lifecycleStatus)}`}>
                      {job.lifecycleStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(job.trackPodPushStatus)}`}>
                        {job.trackPodPushStatus}
                      </span>
                      {job.trackPodDeliveryTrackingUrl ? (
                        <a href={job.trackPodDeliveryTrackingUrl} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-blue-600 underline-offset-2 hover:underline">
                          Delivery link
                        </a>
                      ) : (
                        <div className="text-xs text-slate-500">D: {job.trackPodDeliveryOrderId || "-"}</div>
                      )}
                      {job.trackPodCollectionTrackingUrl ? (
                        <a href={job.trackPodCollectionTrackingUrl} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-blue-600 underline-offset-2 hover:underline">
                          Collection link
                        </a>
                      ) : (
                        <div className="text-xs text-slate-500">C: {job.trackPodCollectionOrderId || "-"}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{toLocale(job.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{toLocale(job.updatedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void loadDetail(job.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(job.id);
                          primeEditForm(job, selectedId === job.id ? selectedDetail : null);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveOrder(job.id)}
                        disabled={archivingId === job.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        {archivingId === job.id ? "Archiving..." : "Archive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendToProcess(job.id)}
                        disabled={sendingToProcessId === job.id}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 disabled:opacity-60"
                      >
                        {sendingToProcessId === job.id ? "Sending..." : "Send to Process It"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredJobs.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredJobs.length)} of {filteredJobs.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {selectedId && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Order detail</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setSelectedDetail(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
          </div>

          {detailLoading || !selectedDetail ? (
            <p className="text-sm text-slate-500">Loading detail...</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Collection</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedDetail.collection.company || "-"}</p>
                  <p className="text-sm text-slate-700">{selectedDetail.collection.addressLine1 || "-"}</p>
                  <p className="text-sm text-slate-700">{selectedDetail.collection.postcode || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedDetail.delivery.company || "-"}</p>
                  <p className="text-sm text-slate-700">{selectedDetail.delivery.addressLine1 || "-"}</p>
                  <p className="text-sm text-slate-700">{selectedDetail.delivery.postcode || "-"}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Timeline</p>
                {selectedDetail.timeline.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No timeline events yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedDetail.timeline.map((event, index) => (
                      <div key={`${event.timestamp}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                          <p className="text-xs text-slate-500">{toLocale(event.timestamp)}</p>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{event.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {editingId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Edit order</h3>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="External ref" value={editForm.externalOrderReference} onChange={(event) => setEditForm((prev) => ({ ...prev, externalOrderReference: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Collection name" value={editForm.collectionName} onChange={(event) => setEditForm((prev) => ({ ...prev, collectionName: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Collection address" value={editForm.collectionAddress} onChange={(event) => setEditForm((prev) => ({ ...prev, collectionAddress: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Collection postcode" value={editForm.collectionPostcode} onChange={(event) => setEditForm((prev) => ({ ...prev, collectionPostcode: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Collection phone" value={editForm.collectionPhone} onChange={(event) => setEditForm((prev) => ({ ...prev, collectionPhone: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Collection email" value={editForm.collectionEmail} onChange={(event) => setEditForm((prev) => ({ ...prev, collectionEmail: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Delivery name" value={editForm.deliveryName} onChange={(event) => setEditForm((prev) => ({ ...prev, deliveryName: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Delivery address" value={editForm.deliveryAddress} onChange={(event) => setEditForm((prev) => ({ ...prev, deliveryAddress: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Delivery postcode" value={editForm.deliveryPostcode} onChange={(event) => setEditForm((prev) => ({ ...prev, deliveryPostcode: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Delivery phone" value={editForm.deliveryPhone} onChange={(event) => setEditForm((prev) => ({ ...prev, deliveryPhone: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Delivery email" value={editForm.deliveryEmail} onChange={(event) => setEditForm((prev) => ({ ...prev, deliveryEmail: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Goods description" value={editForm.goodsDescription} onChange={(event) => setEditForm((prev) => ({ ...prev, goodsDescription: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Quantity" value={editForm.quantity} onChange={(event) => setEditForm((prev) => ({ ...prev, quantity: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Package type (e.g. Pallet)" value={editForm.packageType} onChange={(event) => setEditForm((prev) => ({ ...prev, packageType: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Package count" value={editForm.packageCount} onChange={(event) => setEditForm((prev) => ({ ...prev, packageCount: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Pallet count" value={editForm.palletCount} onChange={(event) => setEditForm((prev) => ({ ...prev, palletCount: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Volume" value={editForm.volume} onChange={(event) => setEditForm((prev) => ({ ...prev, volume: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Dimensions" value={editForm.dimensions} onChange={(event) => setEditForm((prev) => ({ ...prev, dimensions: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Weight (kg)" value={editForm.weightKg} onChange={(event) => setEditForm((prev) => ({ ...prev, weightKg: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={editForm.requestedCollectionDate} onChange={(event) => setEditForm((prev) => ({ ...prev, requestedCollectionDate: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={editForm.requestedDeliveryDate} onChange={(event) => setEditForm((prev) => ({ ...prev, requestedDeliveryDate: event.target.value }))} />
            <textarea className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" rows={3} placeholder="Notes" value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>

          <div className="mt-3">
            <button
              type="button"
              disabled={savingEdit}
              onClick={() => void saveEdit()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {savingEdit ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
