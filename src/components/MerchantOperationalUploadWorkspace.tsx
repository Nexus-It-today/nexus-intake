"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import {
  fetchCurrentProfile,
  type UploadedDocumentMetadata,
} from "@/lib/supabaseClient";

type Props = {
  title: string;
  description: string;
};

export default function MerchantOperationalUploadWorkspace({ title, description }: Props) {
  const [companyId, setCompanyId] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedDocumentMetadata | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setLoadingProfile(true);
        const profile = await fetchCurrentProfile();
        if (!active) return;

        if (!profile.success || !profile.data.companyId) {
          setProfileError(profile.success ? "No company is linked to this user" : profile.error);
          setCompanyId("");
          return;
        }

        setCompanyId(profile.data.companyId);
        setProfileError(null);
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const reviewHref =
    uploaded != null
      ? `/portal/documents/${encodeURIComponent(uploaded.documentId)}/review?draftJobId=${encodeURIComponent(uploaded.jobId)}`
      : "";

  return (
    <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Doorway OCR</p>
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="max-w-3xl text-sm text-slate-600">{description}</p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <Link href="/portal/documents" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Documents</Link>
        <Link href="/process-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Process It</Link>
        <Link href="/app/manage-it/search-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Search</Link>
      </div>

      {loadingProfile ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Loading merchant profile...
        </div>
      ) : profileError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          {profileError}
        </div>
      ) : (
        <DocumentUploadCard
          companyId={companyId}
          onUploadSuccess={(metadata) => {
            setUploaded(metadata);
          }}
        />
      )}

      {uploaded ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Upload ready for review</p>
          <p className="mt-1">Continue to OCR review, confirm Job Number / Job Reference / Product Description, then save booking.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={reviewHref} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">
              Review Draft Job
            </Link>
            <Link href="/portal/documents" className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
              View Documents
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
