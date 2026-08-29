"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TrackItBoardProps = {
  scope: "admin" | "merchant";
  title: string;
  subtitle: string;
};

type TrackOrder = {
  id: string;
  merchantId: string;
  merchantName: string;
  logicalOrderReference: string;
  providerOrderId: string;
  trackId: string;
  journeyLeg: string;
  orderDate: string;
  status: string;
  trackingUrl: string;
  contactName: string;
  updatedAt: string;
};

type TrackItResponse = { orders?: TrackOrder[]; error?: string };
type CaptureResponse = {
  configured?: boolean;
  connected?: boolean;
  success?: boolean;
  recordsSeen?: number;
  logicalOrdersSeen?: number;
  legsCaptured?: number;
  error?: string;
};

function toLocale(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

function displayType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "c" || normalized === "collection") return "Collection";
  if (normalized === "d" || normalized === "delivery") return "Delivery";
  return value || "—";
}

export default function TrackItBoard({ scope, title, subtitle }: TrackItBoardProps) {
  const [orders, setOrders] = useState<TrackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!supabase) throw new Error("Supabase client is unavailable");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Please sign in to view tracking");
    return token;
  }, []);

  const loadOrders = useCallback(async (needle?: string) => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const term = (needle ?? search).trim();
      const url = `/api/track-it/orders?limit=300${term ? `&search=${encodeURIComponent(term)}` : ""}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = (await response.json()) as TrackItResponse;
      if (!response.ok) throw new Error(payload.error ?? `Failed to load tracking (${response.status})`);
      setOrders(payload.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracking");
    } finally {
      setLoading(false);
    }
  }, [getToken, search]);

  const syncTrackPod = useCallback(async () => {
    if (scope !== "admin") return;
    try {
      setSyncing(true);
      setError(null);
      setSyncMessage(null);
      const token = await getToken();
      const response = await fetch("/api/track-it/capture", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as CaptureResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Track-POD sync failed");
      setSyncMessage(`Live Track-POD sync complete: ${payload.logicalOrdersSeen ?? 0} orders / ${payload.legsCaptured ?? 0} records captured.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Track-POD sync failed");
    } finally {
      setSyncing(false);
    }
  }, [getToken, loadOrders, scope]);

  useEffect(() => {
    let cancelled = false;
    async function initialise() {
      if (scope !== "admin") {
        if (!cancelled) await loadOrders();
        return;
      }
      try {
        const token = await getToken();
        const response = await fetch("/api/track-it/capture", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as CaptureResponse;
        if (!cancelled && response.ok && payload.configured && payload.connected) {
          await syncTrackPod();
          return;
        }
      } catch {
        // The normal load below will surface any actual data-access issue.
      }
      if (!cancelled) await loadOrders();
    }
    void initialise();
    return () => { cancelled = true; };
  }, [getToken, loadOrders, scope, syncTrackPod]);

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Track it</p>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scope === "admin" ? <button type="button" onClick={() => void syncTrackPod()} disabled={syncing} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{syncing ? "Syncing…" : "Sync Track-POD"}</button> : null}
          <button type="button" onClick={() => void loadOrders()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
        </div>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void loadOrders(search); }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order ref, Track-POD ID, TrackId, contact, status or merchant" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <button type="submit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Search</button>
        {search ? <button type="button" onClick={() => { setSearch(""); void loadOrders(""); }} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">Clear</button> : null}
      </form>

      {syncMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{syncMessage}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : loading ? <p className="text-sm text-slate-500">Loading Track-POD orders...</p> : orders.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No Track-POD orders match this view yet.</div> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Order Ref</th>
              {scope === "admin" ? <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Merchant</th> : null}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Type</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Track-POD ID</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Contact</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tracking</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Updated</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {orders.map((order) => <tr key={order.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{order.logicalOrderReference}</td>
                {scope === "admin" ? <td className="px-3 py-2 text-slate-700">{order.merchantName}</td> : null}
                <td className="px-3 py-2 text-slate-700">{displayType(order.journeyLeg)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{order.providerOrderId || order.trackId || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{order.contactName || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{order.orderDate || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{order.status || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">Open</a> : "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{toLocale(order.updatedAt)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
