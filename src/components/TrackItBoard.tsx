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

type TrackItResponse = {
  orders?: TrackOrder[];
  error?: string;
};

function toLocale(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

export default function TrackItBoard({ scope, title, subtitle }: TrackItBoardProps) {
  const [orders, setOrders] = useState<TrackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!supabase) throw new Error("Supabase client is unavailable");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to view tracking");

      const response = await fetch("/api/track-it/orders?limit=300", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as TrackItResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load tracking (${response.status})`);
      }

      setOrders(payload.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Track it</p>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading Track-POD orders...</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Track-POD is ready for live capture. No captured orders are stored yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Order Ref</th>
                {scope === "admin" ? <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Merchant</th> : null}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Leg</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Track-POD ID</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Contact</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tracking</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{order.logicalOrderReference}</td>
                  {scope === "admin" ? <td className="px-3 py-2 text-slate-700">{order.merchantName}</td> : null}
                  <td className="px-3 py-2 capitalize text-slate-700">{order.journeyLeg || "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{order.providerOrderId || order.trackId || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{order.contactName || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{order.orderDate || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{order.status || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {order.trackingUrl ? (
                      <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-violet-700 underline">
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{toLocale(order.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
