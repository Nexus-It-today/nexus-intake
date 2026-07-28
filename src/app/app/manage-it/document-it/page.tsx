"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type DocumentStatus =
  | "Uploaded"
  | "Queued"
  | "AI Processing"
  | "Needs Review"
  | "Validated"
  | "Ready to Create"
  | "Job Created"
  | "Route Allocated"
  | "Completed"
  | "Failed";

type DocumentRow = {
  id: string;
  status: DocumentStatus;
  merchant: string;
  customer: string;
  uploadDate: string;
  filename: string;
  documentType: string;
  aiStatus: string;
  aiConfidence: number | null;
  assignedTemplate: string;
  draftJob: string | null;
  liveJob: string | null;
  lastUpdated: string;
};

type TimelineEvent = {
  event: string;
  ts: string;
  actor?: string;
};

type DocumentDetail = DocumentRow & {
  extractedText: string;
  extractedFields: Record<string, string>;
  validationWarnings: string[];
  timeline: TimelineEvent[];
};

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_DOCUMENTS: DocumentRow[] = [
  {
    id: "doc-001",
    status: "Needs Review",
    merchant: "DI Designs",
    customer: "Doorway Group",
    uploadDate: "2026-06-28 09:14",
    filename: "manifest-di-0628.pdf",
    documentType: "Manifest",
    aiStatus: "Extracted",
    aiConfidence: 87,
    assignedTemplate: "Track-POD Standard",
    draftJob: "DFT-0928",
    liveJob: null,
    lastUpdated: "2026-06-28 09:17",
  },
  {
    id: "doc-002",
    status: "Ready to Create",
    merchant: "Nook Home",
    customer: "Doorway Group",
    uploadDate: "2026-06-28 08:55",
    filename: "nook-po-june-28.pdf",
    documentType: "Purchase Order",
    aiStatus: "Validated",
    aiConfidence: 95,
    assignedTemplate: "Track-POD Standard",
    draftJob: "DFT-0927",
    liveJob: null,
    lastUpdated: "2026-06-28 09:10",
  },
  {
    id: "doc-003",
    status: "Completed",
    merchant: "DI Designs",
    customer: "Nook Home",
    uploadDate: "2026-06-27 14:30",
    filename: "delivery-note-1194.pdf",
    documentType: "Delivery Note",
    aiStatus: "Validated",
    aiConfidence: 92,
    assignedTemplate: "Track-POD Standard",
    draftJob: "DFT-0901",
    liveJob: "JOB-4421",
    lastUpdated: "2026-06-27 16:45",
  },
  {
    id: "doc-004",
    status: "AI Processing",
    merchant: "Nexus Delivery Solutions",
    customer: "DI Designs",
    uploadDate: "2026-06-28 10:02",
    filename: "bulk-manifest-0628b.pdf",
    documentType: "Manifest",
    aiStatus: "Processing",
    aiConfidence: null,
    assignedTemplate: "Track-POD Standard",
    draftJob: null,
    liveJob: null,
    lastUpdated: "2026-06-28 10:03",
  },
  {
    id: "doc-005",
    status: "Failed",
    merchant: "Courier to Northern Ireland",
    customer: "Doorway Group",
    uploadDate: "2026-06-28 07:30",
    filename: "cn-manifest-corrupt.pdf",
    documentType: "Manifest",
    aiStatus: "Failed",
    aiConfidence: null,
    assignedTemplate: "—",
    draftJob: null,
    liveJob: null,
    lastUpdated: "2026-06-28 07:35",
  },
];

const MOCK_DETAIL: Record<string, DocumentDetail> = {
  "doc-001": {
    ...MOCK_DOCUMENTS[0],
    extractedText:
      "MANIFEST — DI Designs\nDate: 28/06/2026\nRef: DI-0628\n\n1. Doorway Group, 12 Merchant St, Belfast BT1 1AA\n   SKU: DI-CHAIR-001 Qty: 4\n   Contact: 07700 900123\n\n2. Nook Home, 5 Shore Rd, Holywood BT18 0HX\n   SKU: DI-TABLE-003 Qty: 2\n   Contact: 07700 900456",
    extractedFields: {
      "Order Reference": "DI-0628",
      "Collection Name": "DI Designs",
      "Collection Address": "Unit 4, Boucher Crescent, Belfast BT12 6HU",
      "Delivery Name": "Doorway Group",
      "Delivery Address": "12 Merchant St, Belfast BT1 1AA",
      "Delivery Postcode": "BT1 1AA",
      Phone: "07700 900123",
      "Goods Description": "Chairs x4, Tables x2",
      Quantity: "6",
      "Delivery Date": "30/06/2026",
      "Collection Date": "29/06/2026",
    },
    validationWarnings: [
      "Email address not found in document — please add before creating job",
      "Quantity mismatch: document says 6 items, line count shows 2 deliveries",
    ],
    timeline: [
      { event: "Uploaded", ts: "2026-06-28 09:14", actor: "portal@didesigns.com" },
      { event: "OCR Completed", ts: "2026-06-28 09:15", actor: "AI Engine" },
      { event: "Fields Extracted", ts: "2026-06-28 09:16", actor: "AI Engine" },
      { event: "Needs Review flagged", ts: "2026-06-28 09:17", actor: "AI Engine" },
    ],
  },
  "doc-002": {
    ...MOCK_DOCUMENTS[1],
    extractedText:
      "PURCHASE ORDER\nNook Home Ltd\nPO: NH-PO-240628\nDate: 28/06/2026\n\nShip To: Doorway Group, 5 Shore Rd, Holywood BT18 0HX\nItems: Sofa (x1), Armchair (x2)\nDelivery by: 02/07/2026",
    extractedFields: {
      "PO Number": "NH-PO-240628",
      "Collection Name": "Nook Home Ltd",
      "Collection Address": "Unit 7, Harbour Way, Belfast BT3 9AA",
      "Delivery Name": "Doorway Group",
      "Delivery Address": "5 Shore Rd, Holywood BT18 0HX",
      "Delivery Postcode": "BT18 0HX",
      "Goods Description": "Sofa x1, Armchair x2",
      Quantity: "3",
      "Delivery Date": "02/07/2026",
    },
    validationWarnings: [],
    timeline: [
      { event: "Uploaded", ts: "2026-06-28 08:55", actor: "portal@nookhome.com" },
      { event: "OCR Completed", ts: "2026-06-28 08:56", actor: "AI Engine" },
      { event: "Fields Extracted", ts: "2026-06-28 08:57", actor: "AI Engine" },
      { event: "Validated", ts: "2026-06-28 09:10", actor: "AI Engine" },
    ],
  },
};

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<DocumentStatus, string> = {
  Uploaded: "bg-slate-100 text-slate-700",
  Queued: "bg-blue-50 text-blue-700",
  "AI Processing": "bg-purple-50 text-purple-700",
  "Needs Review": "bg-amber-50 text-amber-700",
  Validated: "bg-sky-50 text-sky-700",
  "Ready to Create": "bg-emerald-50 text-emerald-700",
  "Job Created": "bg-teal-50 text-teal-700",
  "Route Allocated": "bg-indigo-50 text-indigo-700",
  Completed: "bg-green-50 text-green-700",
  Failed: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[status]}`}
    >
      {status}
    </span>
  );
}

// ── Metrics ───────────────────────────────────────────────────────────────────

const METRICS = [
  { label: "Uploaded Today", value: "12", colour: "text-slate-900" },
  { label: "Processing", value: "3", colour: "text-purple-700" },
  { label: "Needs Review", value: "4", colour: "text-amber-600" },
  { label: "Ready to Create", value: "5", colour: "text-emerald-600" },
  { label: "Jobs Created Today", value: "8", colour: "text-teal-600" },
  { label: "Completed Today", value: "6", colour: "text-green-600" },
  { label: "Failed", value: "1", colour: "text-red-600" },
  { label: "Avg AI Confidence", value: "91%", colour: "text-sky-600" },
  { label: "Avg Processing Time", value: "1m 42s", colour: "text-indigo-600" },
];

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  doc,
  onClose,
}: {
  doc: DocumentDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#7C3AED]">Document it.</p>
            <h2 className="text-lg font-semibold text-slate-900">{doc.filename}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Status + confidence */}
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="mb-1 text-xs text-slate-500">Status</p>
              <StatusBadge status={doc.status} />
            </div>
            <div>
              <p className="mb-1 text-xs text-slate-500">AI Confidence</p>
              <p className="text-sm font-semibold text-slate-800">
                {doc.aiConfidence !== null ? `${doc.aiConfidence}%` : "—"}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs text-slate-500">Assigned Template</p>
              <p className="text-sm font-semibold text-slate-800">{doc.assignedTemplate}</p>
            </div>
          </div>

          {/* Validation warnings */}
          {doc.validationWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-700">Validation Warnings</p>
              <ul className="space-y-1">
                {doc.validationWarnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-800">
                    <span>⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Extracted fields */}
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-700">Extracted Fields — Track-POD Mapping</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Field</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Extracted Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(doc.extractedFields).map(([field, value]) => (
                    <tr key={field} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 text-slate-500">{field}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Extracted text */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Extracted Text (OCR)</p>
            <pre className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
              {doc.extractedText}
            </pre>
          </div>

          {/* Timeline */}
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-700">Timeline &amp; Audit Trail</p>
            <div className="space-y-0">
              {doc.timeline.map((t, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-[#7C3AED] mt-1" />
                    {i < doc.timeline.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-slate-800">{t.event}</p>
                    <p className="text-xs text-slate-400">
                      {t.ts}
                      {t.actor ? ` · ${t.actor}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9] transition">
              Approve
            </button>
            <button className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition">
              Create Job
            </button>
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              Edit Fields
            </button>
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              Re-run AI
            </button>
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              Change Template
            </button>
            <button className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition">
              Reject
            </button>
            <button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentItPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>(MOCK_DOCUMENTS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailDoc, setDetailDoc] = useState<DocumentDetail | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMerchant, setFilterMerchant] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [loadingLive, setLoadingLive] = useState(false);

  // Attempt to load real documents from Supabase (additive — falls back to mock)
  useEffect(() => {
    async function loadDocuments() {
      setLoadingLive(true);
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;
        const sb = createClient(url, key);
        const { data, error } = await sb
          .from("uploaded_documents")
          .select("id, file_name, file_type, status, created_at, updated_at, company_id, created_by_profile_id")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error || !data || data.length === 0) return;
        const mapped: DocumentRow[] = data.map((d) => ({
          id: d.id,
          status: mapDbStatus(d.status),
          merchant: "—",
          customer: "—",
          uploadDate: formatTs(d.created_at),
          filename: d.file_name ?? "—",
          documentType: guessDocType(d.file_name),
          aiStatus: mapAiStatus(d.status),
          aiConfidence: null,
          assignedTemplate: "Track-POD Standard",
          draftJob: null,
          liveJob: null,
          lastUpdated: formatTs(d.updated_at ?? d.created_at),
        }));
        setDocuments(mapped);
      } catch {
        // fall back to mock data silently
      } finally {
        setLoadingLive(false);
      }
    }
    void loadDocuments();
  }, []);

  function mapDbStatus(s: string): DocumentStatus {
    const map: Record<string, DocumentStatus> = {
      uploaded: "Uploaded",
      queued: "Queued",
      processing: "AI Processing",
      needs_review: "Needs Review",
      validated: "Validated",
      ready: "Ready to Create",
      job_created: "Job Created",
      route_allocated: "Route Allocated",
      completed: "Completed",
      failed: "Failed",
    };
    return map[s] ?? "Uploaded";
  }

  function mapAiStatus(s: string): string {
    const map: Record<string, string> = {
      uploaded: "Pending",
      queued: "Queued",
      processing: "Processing",
      needs_review: "Needs Review",
      validated: "Validated",
      ready: "Validated",
      job_created: "Validated",
      route_allocated: "Validated",
      completed: "Validated",
      failed: "Failed",
    };
    return map[s] ?? "Pending";
  }

  function guessDocType(name: string | null): string {
    if (!name) return "Unknown";
    const n = name.toLowerCase();
    if (n.includes("manifest")) return "Manifest";
    if (n.includes("po") || n.includes("purchase")) return "Purchase Order";
    if (n.includes("delivery") || n.includes("note")) return "Delivery Note";
    return "Document";
  }

  function formatTs(ts: string | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const merchants = Array.from(new Set(documents.map((d) => d.merchant)));

  const filtered = documents.filter((d) => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterMerchant !== "all" && d.merchant !== filterMerchant) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase()) &&
        !d.customer.toLowerCase().includes(search.toLowerCase()) &&
        !d.merchant.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  }

  function openDetail(id: string) {
    const detail = MOCK_DETAIL[id];
    if (detail) {
      setDetailDoc(detail);
    } else {
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        setDetailDoc({
          ...doc,
          extractedText: "OCR text not available for this document.",
          extractedFields: {},
          validationWarnings: [],
          timeline: [{ event: "Uploaded", ts: doc.uploadDate }],
        });
      }
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#7C3AED]">Manage it.</p>
            <h1 className="text-2xl font-bold text-slate-900">Document it.</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Complete document management — from uploaded file to completed delivery.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/portal/documents"
              className="rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6D28D9] transition"
            >
              Upload Document
            </Link>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className={`text-2xl font-bold ${m.colour}`}>{m.value}</p>
              <p className="mt-1 text-xs text-slate-500 leading-tight">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <input
            type="text"
            placeholder="Search filename, customer, merchant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30"
          >
            <option value="all">All Statuses</option>
            {(
              [
                "Uploaded",
                "Queued",
                "AI Processing",
                "Needs Review",
                "Validated",
                "Ready to Create",
                "Job Created",
                "Route Allocated",
                "Completed",
                "Failed",
              ] as DocumentStatus[]
            ).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterMerchant}
            onChange={(e) => setFilterMerchant(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30"
          >
            <option value="all">All Merchants</option>
            {merchants.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedIds.size > 0 && (
            <div className="flex gap-2 ml-auto">
              <span className="text-sm text-slate-500 self-center">{selectedIds.size} selected</span>
              <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                Approve
              </button>
              <button className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100">
                Create Jobs
              </button>
              <button className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100">
                Re-run AI
              </button>
              <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                Reject
              </button>
            </div>
          )}
        </div>

        {/* Document queue table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loadingLive && (
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-2 text-xs text-slate-500">
              Loading live documents…
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Merchant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Upload Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Filename</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">AI Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Template</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Draft Job</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Live Job</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Last Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-sm text-slate-400">
                      No documents match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(doc.id)}
                          onChange={() => toggleSelect(doc.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">{doc.merchant}</td>
                      <td className="px-4 py-3 text-slate-700">{doc.customer}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{doc.uploadDate}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDetail(doc.id)}
                          className="text-[#7C3AED] hover:underline font-medium text-left"
                        >
                          {doc.filename}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{doc.documentType}</td>
                      <td className="px-4 py-3 text-slate-500">{doc.aiStatus}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {doc.aiConfidence !== null ? (
                          <span
                            className={
                              doc.aiConfidence >= 90
                                ? "text-green-600"
                                : doc.aiConfidence >= 70
                                ? "text-amber-600"
                                : "text-red-600"
                            }
                          >
                            {doc.aiConfidence}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.assignedTemplate}</td>
                      <td className="px-4 py-3">
                        {doc.draftJob ? (
                          <span className="text-xs font-medium text-slate-700">{doc.draftJob}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {doc.liveJob ? (
                          <span className="text-xs font-medium text-teal-700">{doc.liveJob}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{doc.lastUpdated}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openDetail(doc.id)}
                            className="text-xs font-medium text-[#7C3AED] hover:underline"
                          >
                            View
                          </button>
                          {(doc.status === "Ready to Create" || doc.status === "Validated") && (
                            <button className="text-xs font-medium text-emerald-600 hover:underline">
                              Create Job
                            </button>
                          )}
                          {doc.status === "Needs Review" && (
                            <button className="text-xs font-medium text-amber-600 hover:underline">
                              Review
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
            {filtered.length} document{filtered.length !== 1 ? "s" : ""} shown
            {documents !== MOCK_DOCUMENTS
              ? " (live data)"
              : " (demo data — connect Supabase to load live documents)"}
          </div>
        </div>

        {/* Workflow guide */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">Document Workflow</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              "Uploaded",
              "Queued",
              "AI Processing",
              "Needs Review",
              "Validated",
              "Ready to Create",
              "Job Created",
              "Route Allocated",
              "Completed",
            ].map((step, i, arr) => (
              <>
                <span
                  key={step}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600"
                >
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <span key={`arrow-${i}`} className="text-slate-300">→</span>
                )}
              </>
            ))}
            <span className="text-slate-300">or</span>
            <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 font-medium text-red-600">
              Failed
            </span>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {detailDoc && <DetailPanel doc={detailDoc} onClose={() => setDetailDoc(null)} />}
    </>
  );
}
