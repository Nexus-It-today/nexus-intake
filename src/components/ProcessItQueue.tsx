"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessItJob = {
  id: string;
  jobReference: string | null;
  customerName?: string;
  externalOrderReference?: string;
  orderNumber?: string;
  bookingProfileId?: string | null;
  bookingProfileName?: string | null;
  status: string;
  lifecycleStatus: string | null;
  companyId: string;
  merchantName: string;
  collectionName: string;
  collectionAddress: string;
  collectionPhone: string;
  collectionEmail: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryEmail: string;
  goodsDescription: string;
  orderReference: string;
  deliveryDate: string;
  collectionDate: string;
  shipperName: string;
  trackpodDeliveryOrderId: string | null;
  trackpodCollectionOrderId: string | null;
  trackpodDeliveryTrackingUrl: string | null;
  trackpodCollectionTrackingUrl: string | null;
  documentUrl: string | null;
  documentFilename: string | null;
  documentFileType: string | null;
  errorDetail: Record<string, unknown> | null;
  errorAt: string | null;
  pushAttemptedAt: string | null;
  pushCompletedAt: string | null;
  xeroInvoiceId: string | null;
  commercialTotal: string | null;
  paymentStatus: string;
  currentStatus: string | null;
  routeStatus: string | null;
  routeDate: string | null;
  etaWindow: string | null;
  driverName: string | null;
  vehicleName: string | null;
  collectionStatus: string | null;
  deliveryStatus: string | null;
  podAvailable: boolean;
  collectionConfirmedAt: string | null;
  deliveryHoldReason: string | null;
  readinessStatus: "READY_FOR_TRACKPOD" | "NEEDS_REVIEW";
  readinessMissingFields: string[];
  nextRequiredAction: string;
  createdAt: string;
  updatedAt: string;
};

type ViewFilter = "all" | "review" | "pending" | "sent" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLifecycleBadge(job: ProcessItJob) {
  const ls = job.lifecycleStatus;
    if (ls === "REVIEW_REQUIRED" || job.readinessStatus === "NEEDS_REVIEW") {
      return { label: "Needs Review", className: "bg-amber-100 text-amber-800 border border-amber-200" };
    }
    if (ls === "HELD_FUTURE_DATE") {
      return { label: "HELD - FUTURE DATE", className: "bg-amber-100 text-amber-800 border border-amber-200" };
    }
    if (ls === "COLLECTION_RELEASED_DELIVERY_HELD" || ls === "COLLECTION_CONFIRMED_AWAITING_DELIVERY_RELEASE") {
      return { label: "Delivery Held", className: "bg-sky-100 text-sky-800 border border-sky-200" };
    }
  const hasDelivery = Boolean(job.trackpodDeliveryOrderId);
  const hasCollection = Boolean(job.trackpodCollectionOrderId);

  if (ls === "TRACKPOD_ERROR") {
    return { label: "Error", className: "bg-red-100 text-red-700 border border-red-200" };
  }
  if (ls === "READY_FOR_ROUTE" || (hasDelivery && hasCollection)) {
    return { label: "Sent to Track-POD", className: "bg-emerald-100 text-emerald-700 border border-emerald-200" };
  }
  if (hasDelivery && !hasCollection) {
    return { label: "Partial", className: "bg-amber-100 text-amber-700 border border-amber-200" };
  }
  if (ls === "READY_FOR_TRACKPOD" || job.status === "job_created") {
    return { label: "Ready", className: "bg-violet-100 text-violet-700 border border-violet-200" };
  }
  return { label: job.status ?? "—", className: "bg-slate-100 text-slate-600 border border-slate-200" };
}

function getTrackPodStatusBadge(job: ProcessItJob) {
  const hasDelivery = Boolean(job.trackpodDeliveryOrderId);
  const hasCollection = Boolean(job.trackpodCollectionOrderId);
  if (hasDelivery && hasCollection) {
    return { label: "Created", className: "bg-emerald-50 text-emerald-700" };
  }
  if (hasDelivery || hasCollection) {
    return { label: "Partial", className: "bg-amber-50 text-amber-700" };
  }
  if (job.lifecycleStatus === "TRACKPOD_ERROR") {
    return { label: "Failed", className: "bg-red-50 text-red-700" };
  }
  return { label: "Pending", className: "bg-slate-50 text-slate-500" };
}

function truncateId(id: string | null): string {
  if (!id) return "—";
  // Location header is full URL — extract last segment
  const parts = id.split("/");
  const last = parts[parts.length - 1] ?? id;
  return last.length > 16 ? last.slice(0, 16) + "…" : last;
}

function jobMatchesFilter(job: ProcessItJob, filter: ViewFilter): boolean {
  if (filter === "all") return true;
  const ls = job.lifecycleStatus;
  const hasDelivery = Boolean(job.trackpodDeliveryOrderId);
  const hasCollection = Boolean(job.trackpodCollectionOrderId);
  if (filter === "review") {
    return ls === "REVIEW_REQUIRED" || job.readinessStatus === "NEEDS_REVIEW";
  }
  if (filter === "sent") return Boolean(hasDelivery && hasCollection);
  if (filter === "error") return ls === "TRACKPOD_ERROR";
  if (filter === "pending") return !hasDelivery && !hasCollection && ls !== "TRACKPOD_ERROR";
  return true;
}

// ─── Create Job Form ──────────────────────────────────────────────────────────

type CreateJobFormData = {
  orderReference: string;
  collectionName: string;
  collectionAddress: string;
  collectionPhone: string;
  collectionEmail: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryEmail: string;
  goodsDescription: string;
  shipperName: string;
  deliveryDate: string;
  notes: string;
  trackpodPhotoNote: string;
};

const EMPTY_FORM: CreateJobFormData = {
  orderReference: "",
  collectionName: "",
  collectionAddress: "",
  collectionPhone: "",
  collectionEmail: "",
  deliveryName: "",
  deliveryAddress: "",
  deliveryPhone: "",
  deliveryEmail: "",
  goodsDescription: "",
  shipperName: "",
  deliveryDate: "",
  notes: "",
  trackpodPhotoNote: "",
};

function CreateJobForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (jobId: string, ref: string, sentToTrackPod: boolean) => void;
}) {
  const [form, setForm] = useState<CreateJobFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const set = (field: keyof CreateJobFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Step 1 — create the job record
      const createRes = await fetch("/api/process-it/create-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderReference: form.orderReference || undefined,
          collectionName: form.collectionName,
          collectionAddress: form.collectionAddress,
          collectionPhone: form.collectionPhone,
          collectionEmail: form.collectionEmail,
          deliveryName: form.deliveryName,
          deliveryAddress: form.deliveryAddress,
          deliveryPhone: form.deliveryPhone,
          deliveryEmail: form.deliveryEmail,
          goodsDescription: form.goodsDescription || "General goods",
          shipperName: form.shipperName || form.collectionName,
          deliveryDate: form.deliveryDate || undefined,
          notes: form.notes || undefined,
          trackpodPhotoNote: form.trackpodPhotoNote || undefined,
        }),
      });

      const createJson = (await createRes.json()) as {
        success?: boolean;
        jobId?: string;
        jobReference?: string;
        error?: string;
      };

      if (!createRes.ok || !createJson.jobId) {
        throw new Error(createJson.error ?? `Create failed (${createRes.status})`);
      }

      const { jobId, jobReference } = createJson;

      onCreated(jobId!, jobReference!, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#7C3AED] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-200">Process it</p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">Create Job</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-2 text-violet-200 hover:bg-violet-700 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 space-y-6 px-6 py-6">
          {/* Order reference */}
          <FieldGroup label="Order Reference" hint="Leave blank to auto-generate">
            <FormInput
              ref={firstFieldRef}
              placeholder="e.g. WC-12345 or leave blank"
              value={form.orderReference}
              onChange={set("orderReference")}
            />
          </FieldGroup>

          {/* Collection */}
          <fieldset>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Collection
            </legend>
            <div className="space-y-3">
              <FieldGroup label="Name *">
                <FormInput
                  required
                  placeholder="Collection contact / business name"
                  value={form.collectionName}
                  onChange={set("collectionName")}
                />
              </FieldGroup>
              <FieldGroup label="Address *">
                <FormInput
                  required
                  placeholder="Full collection address"
                  value={form.collectionAddress}
                  onChange={set("collectionAddress")}
                />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Phone">
                  <FormInput
                    placeholder="+44 7700 000000"
                    value={form.collectionPhone}
                    onChange={set("collectionPhone")}
                  />
                </FieldGroup>
                <FieldGroup label="Email">
                  <FormInput
                    type="email"
                    placeholder="collection@example.com"
                    value={form.collectionEmail}
                    onChange={set("collectionEmail")}
                  />
                </FieldGroup>
              </div>
            </div>
          </fieldset>

          {/* Delivery */}
          <fieldset>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Delivery
            </legend>
            <div className="space-y-3">
              <FieldGroup label="Name *">
                <FormInput
                  required
                  placeholder="Delivery recipient / business name"
                  value={form.deliveryName}
                  onChange={set("deliveryName")}
                />
              </FieldGroup>
              <FieldGroup label="Address *">
                <FormInput
                  required
                  placeholder="Full delivery address"
                  value={form.deliveryAddress}
                  onChange={set("deliveryAddress")}
                />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Phone">
                  <FormInput
                    placeholder="+44 7700 000001"
                    value={form.deliveryPhone}
                    onChange={set("deliveryPhone")}
                  />
                </FieldGroup>
                <FieldGroup label="Email">
                  <FormInput
                    type="email"
                    placeholder="delivery@example.com"
                    value={form.deliveryEmail}
                    onChange={set("deliveryEmail")}
                  />
                </FieldGroup>
              </div>
            </div>
          </fieldset>

          {/* Order details */}
          <fieldset>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Order Details
            </legend>
            <div className="space-y-3">
              <FieldGroup label="Goods Description">
                <FormInput
                  placeholder="e.g. Furniture — 2 boxes"
                  value={form.goodsDescription}
                  onChange={set("goodsDescription")}
                />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Shipper / Depot">
                  <FormInput
                    placeholder="Shipper name"
                    value={form.shipperName}
                    onChange={set("shipperName")}
                  />
                </FieldGroup>
                <FieldGroup label="Delivery Date">
                  <FormInput
                    type="date"
                    value={form.deliveryDate}
                    onChange={set("deliveryDate")}
                  />
                </FieldGroup>
              </div>
              <FieldGroup label="Notes">
                <textarea
                  rows={2}
                  placeholder="Special instructions or notes"
                  value={form.notes}
                  onChange={set("notes")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </FieldGroup>
              <FieldGroup label="Track-POD Photo Note" hint="Shown to driver at collection">
                <FormInput
                  placeholder="e.g. Please photograph all items before loading"
                  value={form.trackpodPhotoNote}
                  onChange={set("trackpodPhotoNote")}
                />
              </FieldGroup>
            </div>
          </fieldset>

          {/* Submit */}
          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "Creating job…" : "Create Job"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {hint && <span className="ml-1.5 font-normal text-slate-400">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const FormInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function FormInput(props, ref) {
    return (
      <input
        {...props}
        ref={ref}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
      />
    );
  }
);

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ job, onClose }: { job: ProcessItJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Job Detail</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
              {job.jobReference ?? job.id.slice(0, 8).toUpperCase()}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 px-6 py-6">
          {/* Status */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Status</p>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Lifecycle" value={job.lifecycleStatus ?? job.status} />
              <DetailRow label="Current" value={job.currentStatus ?? "—"} />
              <DetailRow label="Route Status" value={job.routeStatus ?? "Not Planned"} />
              <DetailRow label="Route Date" value={job.routeDate ?? "—"} />
              <DetailRow label="ETA Window" value={job.etaWindow ?? "—"} />
              <DetailRow label="Driver" value={job.driverName ?? "—"} />
              <DetailRow label="Vehicle" value={job.vehicleName ?? "—"} />
              <DetailRow label="POD Available" value={job.podAvailable ? "Yes" : "No"} />
              <DetailRow label="Push attempted" value={job.pushAttemptedAt ? new Date(job.pushAttemptedAt).toLocaleString() : "—"} />
              <DetailRow label="Push completed" value={job.pushCompletedAt ? new Date(job.pushCompletedAt).toLocaleString() : "—"} />
            </div>
          </section>

          {/* Collection */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Collection</p>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Name" value={job.collectionName || "—"} />
              <DetailRow label="Phone" value={job.collectionPhone || "—"} />
              <DetailRow label="Address" value={job.collectionAddress || "—"} span />
              <DetailRow label="Email" value={job.collectionEmail || "—"} span />
            </div>
          </section>

          {/* Delivery */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Delivery</p>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Name" value={job.deliveryName || "—"} />
              <DetailRow label="Phone" value={job.deliveryPhone || "—"} />
              <DetailRow label="Address" value={job.deliveryAddress || "—"} span />
              <DetailRow label="Email" value={job.deliveryEmail || "—"} span />
            </div>
          </section>

          {/* Track-POD */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Track-POD</p>
            <div className="space-y-2">
              <DetailRow label="Delivery Order ID" value={job.trackpodDeliveryOrderId || "Not created"} span mono />
              <DetailRow label="Collection Order ID" value={job.trackpodCollectionOrderId || "Not created"} span mono />
              {job.trackpodDeliveryTrackingUrl && (
                <div>
                  <p className="text-xs text-slate-500">Delivery Tracking</p>
                  <a
                    href={job.trackpodDeliveryTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-violet-600 underline underline-offset-2 hover:text-violet-800"
                  >
                    Open tracking link ↗
                  </a>
                </div>
              )}
              {job.trackpodCollectionTrackingUrl && (
                <div>
                  <p className="text-xs text-slate-500">Collection Tracking</p>
                  <a
                    href={job.trackpodCollectionTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-violet-600 underline underline-offset-2 hover:text-violet-800"
                  >
                    Open tracking link ↗
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Document */}
          {job.documentUrl && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Document</p>
              <a
                href={job.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {job.documentFilename || "Open document"}
              </a>
            </section>
          )}

          {/* Error */}
          {job.errorDetail && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-600">Error Detail</p>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                {job.errorAt && (
                  <p className="mb-2 text-xs text-red-500">{new Date(job.errorAt).toLocaleString()}</p>
                )}
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-red-800">
                  {JSON.stringify(job.errorDetail, null, 2)}
                </pre>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  span,
  mono,
}: {
  label: string;
  value: string;
  span?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProcessItQueue({
  scope = "admin",
  sourceOrdersPath = "/orders",
}: {
  scope?: "admin" | "merchant";
  sourceOrdersPath?: string;
}) {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId")?.trim() ?? "";
  const queryFilter = (searchParams.get("filter")?.trim().toLowerCase() ?? "") as ViewFilter;
  const [jobs, setJobs] = useState<ProcessItJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>(["all", "review", "pending", "sent", "error"].includes(queryFilter) ? queryFilter : "all");
  const [selectedJob, setSelectedJob] = useState<ProcessItJob | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [paymentLinkingId, setPaymentLinkingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase not available");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      const params = new URLSearchParams({ scope });
      if (companyId && scope === "admin") {
        params.set("companyId", companyId);
      }

      const res = await fetch(`/api/process-it/queue?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      const json = (await res.json()) as { jobs: ProcessItJob[] };
      setJobs(json.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [companyId, scope]);

  useEffect(() => {
    if (["all", "review", "pending", "sent", "error"].includes(queryFilter)) {
      setFilter(queryFilter);
    }
  }, [queryFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const releaseToTrackPod = useCallback(
    async (job: ProcessItJob, releaseMode: "collection" | "delivery", adminOverride = false) => {
      if (!supabase) return;
      setSendingId(job.id);
      setSendResult((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        const res = await fetch("/api/process-it/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ draftJobId: job.id, releaseMode, adminOverride }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          trackpodDeliveryOrderId?: string;
          trackpodCollectionOrderId?: string;
          lifecycleStatus?: string;
          partialSuccess?: unknown;
        };

        if (!res.ok) {
          setSendResult((prev) => ({
            ...prev,
            [job.id]: { ok: false, msg: json.error ?? `Error ${res.status}` },
          }));
        } else {
          const modeLabel = releaseMode === "collection" ? "Collection released" : "Delivery released";
          setSendResult((prev) => ({
            ...prev,
            [job.id]: {
              ok: true,
              msg: `${modeLabel} — Delivery: ${json.trackpodDeliveryOrderId?.slice(-12) ?? "pending"} | Collection: ${json.trackpodCollectionOrderId?.slice(-12) ?? "pending"}`,
            },
          }));
          // Refresh queue after short delay
          setTimeout(() => void loadJobs(), 1200);
        }
      } catch (e) {
        setSendResult((prev) => ({
          ...prev,
          [job.id]: { ok: false, msg: e instanceof Error ? e.message : "Unknown error" },
        }));
      } finally {
        setSendingId(null);
      }
    },
    [loadJobs]
  );

  const confirmCollection = useCallback(
    async (job: ProcessItJob) => {
      if (!supabase) return;
      setConfirmingId(job.id);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        const res = await fetch("/api/process-it/confirm-collection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ draftJobId: job.id }),
        });

        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setSendResult((prev) => ({
            ...prev,
            [job.id]: { ok: false, msg: json.error ?? `Error ${res.status}` },
          }));
        } else {
          setSendResult((prev) => ({
            ...prev,
            [job.id]: { ok: true, msg: "Collection confirmed. Delivery can now be released." },
          }));
          setTimeout(() => void loadJobs(), 800);
        }
      } catch (error) {
        setSendResult((prev) => ({
          ...prev,
          [job.id]: { ok: false, msg: error instanceof Error ? error.message : "Unknown error" },
        }));
      } finally {
        setConfirmingId(null);
      }
    },
    [loadJobs]
  );

  const archiveBooking = useCallback(
    async (job: ProcessItJob) => {
      if (!supabase) return;
      setArchivingId(job.id);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        const res = await fetch("/api/process-it/archive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ draftJobId: job.id }),
        });

        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setSendResult((prev) => ({
            ...prev,
            [job.id]: { ok: false, msg: json.error ?? `Error ${res.status}` },
          }));
        } else {
          setSendResult((prev) => ({
            ...prev,
            [job.id]: { ok: true, msg: "Booking archived" },
          }));
          setTimeout(() => void loadJobs(), 800);
        }
      } catch (error) {
        setSendResult((prev) => ({
          ...prev,
          [job.id]: { ok: false, msg: error instanceof Error ? error.message : "Unknown error" },
        }));
      } finally {
        setArchivingId(null);
      }
    },
    [loadJobs]
  );

  const createPaymentLink = useCallback(async (job: ProcessItJob) => {
    if (!supabase) return;
    setPaymentLinkingId(job.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch("/api/payments/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ draftJobId: job.id }),
      });
      const result = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? "Could not create payment link");
      await navigator.clipboard.writeText(result.checkoutUrl).catch(() => undefined);
      setSendResult((previous) => ({
        ...previous,
        [job.id]: { ok: true, msg: "Payment link created and copied. Opening Stripe Checkout…" },
      }));
      window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => void loadJobs(), 800);
    } catch (error) {
      setSendResult((previous) => ({
        ...previous,
        [job.id]: { ok: false, msg: error instanceof Error ? error.message : "Could not create payment link" },
      }));
    } finally {
      setPaymentLinkingId(null);
    }
  }, [loadJobs]);

  const filteredJobs = jobs.filter((j) => jobMatchesFilter(j, filter));

  const counts = {
    all: jobs.length,
    review: jobs.filter((j) => jobMatchesFilter(j, "review")).length,
    pending: jobs.filter((j) => jobMatchesFilter(j, "pending")).length,
    sent: jobs.filter((j) => jobMatchesFilter(j, "sent")).length,
    error: jobs.filter((j) => jobMatchesFilter(j, "error")).length,
  };

  const openSourceOrder = useCallback((jobId: string, edit = false) => {
    const params = new URLSearchParams({ orderId: jobId });
    if (companyId && scope === "admin") {
      params.set("companyId", companyId);
    }
    if (edit) {
      params.set("edit", "1");
    }
    window.location.href = `${sourceOrdersPath}?${params.toString()}`;
  }, [companyId, scope, sourceOrdersPath]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Process it
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Track-POD Queue</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Release collections first, confirm collection completion, then release deliveries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 hover:bg-violet-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Job
          </button>
          <button
            onClick={() => void loadJobs()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            >
              <path d="M4 4v5h5M20 20v-5h-5" />
              <path d="M4 9a9 9 0 0115-4.5M20 15a9 9 0 01-15 4.5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "review", "pending", "sent", "error"] as ViewFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f
                ? f === "error"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-[#7C3AED] text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "review" ? "Review" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                filter === f ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center gap-3 py-12 text-slate-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5 animate-spin"
          >
            <path d="M4 4v5h5M20 20v-5h-5" />
            <path d="M4 9a9 9 0 0115-4.5M20 15a9 9 0 01-15 4.5" />
          </svg>
          Loading queue…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredJobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <p className="text-sm font-medium text-slate-500">No jobs in this view</p>
          <p className="mt-1 text-xs text-slate-400">
            {filter === "pending"
              ? "All confirmed jobs have already been sent to Track-POD."
              : "No records match this filter."}
          </p>
        </div>
      )}

      {/* Queue table */}
      {!loading && filteredJobs.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {[
                  "Master Order",
                  "Merchant",
                  "Route Status",
                  "Route Date",
                  "ETA Window",
                  "Collection",
                  "Delivery",
                  "Current Status",
                  "Track-POD",
                  "Collection ID",
                  "Delivery ID",
                  "Documents",
                  "Tracking Links",
                  "Errors",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.map((job) => {
                const lifecycle = getLifecycleBadge(job);
                const tpStatus = getTrackPodStatusBadge(job);
                const isSending = sendingId === job.id;
                const result = sendResult[job.id];
                const hasDelivery = Boolean(job.trackpodDeliveryOrderId);
                const hasCollection = Boolean(job.trackpodCollectionOrderId);
                const bothSent = hasDelivery && hasCollection;
                const hasError = job.lifecycleStatus === "TRACKPOD_ERROR";
                const canReleaseCollection = !hasCollection;
                const canConfirmCollection = hasCollection && !job.collectionConfirmedAt;
                const canReleaseDelivery = hasCollection && !hasDelivery;
                const blockedByFutureDate = job.deliveryHoldReason === "HELD - FUTURE DATE";
                const isArchived = job.lifecycleStatus === "ARCHIVED";
                const blockedByReadiness = job.readinessStatus === "NEEDS_REVIEW";

                return (
                  <tr key={job.id} className="hover:bg-slate-50/60">
                    {/* Master Order */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">
                        {job.jobReference ?? job.id.slice(0, 8).toUpperCase()}
                      </div>
                      {job.externalOrderReference ? (
                        <div className="mt-0.5 text-xs text-slate-500">Merchant ref: {job.externalOrderReference}</div>
                      ) : null}
                      {job.orderNumber ? (
                        <div className="mt-0.5 text-xs text-slate-500">Order Number: {job.orderNumber}</div>
                      ) : null}
                      {job.orderReference && job.orderReference !== job.jobReference && (
                        <div className="mt-0.5 text-xs text-slate-400">{job.orderReference}</div>
                      )}
                      {job.customerName ? (
                        <div className="mt-0.5 text-xs text-slate-500">Customer: {job.customerName}</div>
                      ) : null}
                      {job.bookingProfileName ? (
                        <div className="mt-0.5 text-xs text-violet-700">Profile: {job.bookingProfileName}</div>
                      ) : null}
                      <div className="mt-1">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${lifecycle.className}`}>
                          {lifecycle.label}
                        </span>
                      </div>
                    </td>

                    {/* Merchant */}
                    <td className="px-4 py-3">
                      <div className="max-w-[120px] truncate font-medium text-slate-700">
                        {job.merchantName || "—"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        job.routeStatus === "Route Confirmed"
                          ? "bg-emerald-50 text-emerald-700"
                          : job.routeStatus === "Route in Planning"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        {job.routeStatus ?? "Not Planned"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      {job.routeDate || "—"}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      {job.etaWindow || "—"}
                    </td>

                    {/* Collection */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{job.collectionName || "—"}</div>
                      <div className="mt-0.5 max-w-[160px] truncate text-xs text-slate-400">
                        {job.collectionAddress || ""}
                      </div>
                    </td>

                    {/* Delivery */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{job.deliveryName || "—"}</div>
                      <div className="mt-0.5 max-w-[160px] truncate text-xs text-slate-400">
                        {job.deliveryAddress || ""}
                      </div>
                    </td>

                    {/* Current Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tpStatus.className}`}>
                        {tpStatus.label}
                      </span>
                      <div className="mt-1 text-[11px] text-slate-500">{job.nextRequiredAction}</div>
                      {job.readinessMissingFields.length > 0 ? (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Missing: {job.readinessMissingFields.join(", ")}
                        </div>
                      ) : null}
                      {job.pushCompletedAt && (
                        <div className="mt-1 text-xs text-slate-400">
                          {new Date(job.pushCompletedAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>

                    {/* Track-POD status badge */}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusDot label="Delivery" active={hasDelivery} />
                        <StatusDot label="Collection" active={hasCollection} />
                      </div>
                    </td>

                    {/* Collection ID */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {job.trackpodCollectionOrderId ? (
                        <span title={job.trackpodCollectionOrderId}>
                          {truncateId(job.trackpodCollectionOrderId)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Delivery ID */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {job.trackpodDeliveryOrderId ? (
                        <span title={job.trackpodDeliveryOrderId}>
                          {truncateId(job.trackpodDeliveryOrderId)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Documents */}
                    <td className="px-4 py-3">
                      {job.documentUrl ? (
                        <a
                          href={job.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          title={job.documentFilename ?? ""}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          {job.documentFileType?.toUpperCase() ?? "DOC"}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Tracking Links */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {job.trackpodDeliveryTrackingUrl && (
                          <a
                            href={job.trackpodDeliveryTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                            </svg>
                            Delivery
                          </a>
                        )}
                        {job.trackpodCollectionTrackingUrl && (
                          <a
                            href={job.trackpodCollectionTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                            </svg>
                            Collection
                          </a>
                        )}
                        {!job.trackpodDeliveryTrackingUrl && !job.trackpodCollectionTrackingUrl && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>

                    {/* Errors */}
                    <td className="px-4 py-3">
                      {hasError && job.errorDetail ? (
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          View error
                        </button>
                      ) : result && !result.ok ? (
                        <span className="max-w-[120px] truncate text-xs text-red-600" title={result.msg}>
                          {result.msg}
                        </span>
                      ) : result?.ok ? (
                        <span className="text-xs text-emerald-600">✓ Sent</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* View */}
                        <ActionButton
                          label="View"
                          onClick={() => setSelectedJob(job)}
                          variant="ghost"
                        />

                        <ActionButton
                          label="Source Order"
                          onClick={() => openSourceOrder(job.id, false)}
                          variant="ghost"
                        />

                        <ActionButton
                          label="Edit Source"
                          onClick={() => openSourceOrder(job.id, true)}
                          variant="ghost"
                        />

                        <ActionButton
                          label={paymentLinkingId === job.id ? "Creating link…" : job.paymentStatus === "paid" ? "Paid" : "Payment link"}
                          onClick={() => void createPaymentLink(job)}
                          disabled={paymentLinkingId === job.id || job.paymentStatus === "paid"}
                          variant={job.paymentStatus === "paid" ? "ghost" : "link"}
                        />

                        {/* Send / Retry */}
                        {!bothSent && (
                          <>
                            {canReleaseCollection ? (
                              <ActionButton
                                label={isSending ? "Releasing…" : "Release Collection"}
                                onClick={() => void releaseToTrackPod(job, "collection")}
                                disabled={isSending || isArchived || blockedByReadiness}
                                variant={hasError ? "warning" : "primary"}
                              />
                            ) : null}

                            {canConfirmCollection ? (
                              <ActionButton
                                label={confirmingId === job.id ? "Confirming…" : "Confirm Collection"}
                                onClick={() => void confirmCollection(job)}
                                disabled={confirmingId === job.id || isArchived}
                                variant="ghost"
                              />
                            ) : null}

                            {canReleaseDelivery ? (
                              <ActionButton
                                label={isSending ? "Releasing…" : blockedByFutureDate ? "Admin Override Release" : "Release Delivery"}
                                onClick={() => void releaseToTrackPod(job, "delivery", blockedByFutureDate)}
                                disabled={isSending || (!job.collectionConfirmedAt && !blockedByFutureDate) || isArchived || blockedByReadiness}
                                variant={blockedByFutureDate ? "warning" : "primary"}
                              />
                            ) : null}
                          </>
                        )}

                        {blockedByReadiness ? (
                          <ActionButton
                            label="Needs review"
                            onClick={() => openSourceOrder(job.id, true)}
                            variant="warning"
                          />
                        ) : null}

                        {!isArchived ? (
                          <ActionButton
                            label={archivingId === job.id ? "Archiving…" : "Archive"}
                            onClick={() => void archiveBooking(job)}
                            disabled={archivingId === job.id}
                            variant="warning"
                          />
                        ) : null}

                        {/* Open collection tracking */}
                        {job.trackpodCollectionTrackingUrl && (
                          <ActionButton
                            label="Collection"
                            onClick={() => window.open(job.trackpodCollectionTrackingUrl!, "_blank")}
                            variant="link"
                          />
                        )}

                        {/* Open delivery tracking */}
                        {job.trackpodDeliveryTrackingUrl && (
                          <ActionButton
                            label="Delivery"
                            onClick={() => window.open(job.trackpodDeliveryTrackingUrl!, "_blank")}
                            variant="link"
                          />
                        )}

                        {/* Documents */}
                        {job.documentUrl && (
                          <ActionButton
                            label="Doc"
                            onClick={() => window.open(job.documentUrl!, "_blank")}
                            variant="ghost"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selectedJob && (
        <DetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* Create Job form */}
      {showCreateForm && (
        <CreateJobForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            void loadJobs();
          }}
        />
      )}
    </div>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${active ? "bg-emerald-400" : "bg-slate-200"}`}
      />
      <span className={`text-xs ${active ? "text-slate-600" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "ghost",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "warning" | "ghost" | "link";
}) {
  const base =
    "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50";
  const variants = {
    primary:
      "bg-[#7C3AED] text-white hover:bg-violet-700 shadow-sm shadow-violet-200",
    warning:
      "bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-200",
    ghost:
      "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    link: "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {label}
    </button>
  );
}
