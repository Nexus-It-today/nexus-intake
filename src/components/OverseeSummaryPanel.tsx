"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { DashboardRow } from "@/lib/orders/dashboard";

type OverseeSummaryPanelProps = {
  scope: "admin" | "merchant";
};

type DashboardResponse = {
  jobs: DashboardRow[];
  error?: string;
};

type SummaryCard = {
  label: string;
  value: number;
  href: string;
};

function isSameDay(value: string, now = new Date()): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export default function OverseeSummaryPanel({ scope }: OverseeSummaryPanelProps) {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId")?.trim() ?? "";
  const [jobs, setJobs] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!supabase) throw new Error("Supabase client is unavailable");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to view operational summary");

      const params = new URLSearchParams({ scope, limit: "300" });
      if (scope === "admin" && companyId) {
        params.set("companyId", companyId);
      }

      const response = await fetch(`/api/orders/dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as DashboardResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load overview (${response.status})`);
      }

      setJobs(payload.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [companyId, scope]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const contextQuery = scope === "admin" && companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const baseOrdersPath = scope === "admin" ? `/orders${contextQuery}` : "/portal/orders";
  const baseTrackPath = scope === "admin" ? `/track-it${contextQuery}` : "/portal/track-it";
  const reviewPath = scope === "admin"
    ? `/review-it?status=${encodeURIComponent("Needs Review,Failed / issue,Failed to send to Track-POD")}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ""}`
    : `/portal/orders?status=${encodeURIComponent("Needs Review")}`;

  const summary = useMemo(() => {
    const todaysJobs = jobs.filter((job) => isSameDay(job.createdAt));
    const review = todaysJobs.filter((job) => job.lifecycleStatus === "Needs Review").length;
    const accepted = jobs.filter((job) => Boolean(job.trackPodCollectionOrderId || job.trackPodDeliveryOrderId)).length;
    const planning = jobs.filter((job) => {
      const current = (job.currentStatus || "").toLowerCase();
      return current.includes("planning") || current.includes("route") || job.rawLifecycleStatus.toLowerCase().includes("ready_for_route");
    }).length;
    const inTransit = jobs.filter((job) => {
      const current = (job.currentStatus || "").toLowerCase();
      return current.includes("transit") || current.includes("out for delivery") || current.includes("collected");
    }).length;
    const delivered = jobs.filter((job) => (job.currentStatus || "").toLowerCase().includes("delivered")).length;
    const issues = jobs.filter((job) => job.trackPodPushStatus === "Failed" || job.lifecycleStatus === "Failed / issue").length;
    const merchants = new Set(todaysJobs.map((job) => job.merchantName).filter(Boolean)).size;
    const todaysOrders = todaysJobs.length;

    const cards: SummaryCard[] = scope === "admin"
      ? [
          { label: "Today's orders", value: todaysOrders, href: `${baseOrdersPath}?window=today` },
          { label: "Organisations / merchants", value: merchants, href: "/merchants" },
          { label: "Needs review", value: review, href: reviewPath },
          { label: "Accepted / Track it", value: accepted, href: baseTrackPath },
          { label: "Planning", value: planning, href: baseTrackPath },
          { label: "In transit", value: inTransit, href: baseTrackPath },
          { label: "Delivered", value: delivered, href: baseTrackPath },
        ]
      : [
          { label: "Today's orders", value: todaysOrders, href: `${baseOrdersPath}?window=today` },
          { label: "Needs review", value: review, href: `${baseOrdersPath}?window=today&status=Needs Review` },
          { label: "Accepted / Track it", value: accepted, href: baseTrackPath },
          { label: "Planning", value: planning, href: baseTrackPath },
          { label: "In transit", value: inTransit, href: baseTrackPath },
          { label: "Delivered", value: delivered, href: baseTrackPath },
        ];

    const notifications = [
      todaysOrders > 0 ? `${todaysOrders} order${todaysOrders === 1 ? "" : "s"} are on today's board.` : null,
      review > 0 ? `${review} order${review === 1 ? "" : "s"} need review before Track-POD release.` : null,
      accepted > 0 ? `${accepted} accepted order${accepted === 1 ? " is" : "s are"} visible in Track it.` : null,
      delivered > 0 ? `${delivered} delivered order${delivered === 1 ? "" : "s"} ready for follow-up and invoicing.` : null,
      issues > 0 ? `${issues} order${issues === 1 ? " has" : "s have"} Track-POD or workflow issues needing attention.` : null,
    ].filter((item): item is string => Boolean(item));

    return { cards, notifications };
  }, [baseOrdersPath, baseTrackPath, jobs, reviewPath, scope]);

  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Oversee it</p>
        <h2 className="text-2xl font-semibold text-slate-950">
          {scope === "admin" ? "Operational oversight" : "Merchant oversight"}
        </h2>
        <p className="text-sm text-slate-600">
          {scope === "admin"
            ? "Today-first operational visibility across merchants, review pressure, accepted work, and Track-POD progress."
            : "Today-first visibility for your own orders, review items, accepted work, tracking links, and operational attention points."}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading oversight summary...</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summary.cards.map((card) => (
              <Link key={card.label} href={card.href} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-blue-300 hover:bg-white">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
              </Link>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">{summary.notifications.length}</span>
            </div>
            {summary.notifications.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No operational alerts right now.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {summary.notifications.map((item) => (
                  <li key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}