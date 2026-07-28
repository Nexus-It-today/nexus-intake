"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BusinessType,
  createOrUpdateCompany,
  createOrUpdateProfile,
  fetchProfileByUserId,
} from "@/lib/authOnboarding";
import { supabase } from "@/lib/supabaseClient";

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "courier", label: "Courier" },
  { value: "fulfilment", label: "Fulfilment" },
  { value: "retailer", label: "Retailer" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "marketplace_seller", label: "Marketplace Seller" },
  { value: "other", label: "Other" },
];

function isBusinessType(value: unknown): value is BusinessType {
  return BUSINESS_TYPES.some((type) => type.value === value);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(() => crypto.randomUUID());
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("courier");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        if (!supabase) {
          setLoading(false);
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          router.replace("/signin");
          return;
        }

        setUserId(user.id);
        const profile = await fetchProfileByUserId(user.id);

        if (profile) {
          const role = (profile.role ?? "").trim().toLowerCase();
          router.replace(role === "customer" ? "/customer" : "/");
          return;
        }

        const metadata = user.user_metadata ?? {};
        if (typeof metadata.company_id === "string" && metadata.company_id.trim()) {
          setCompanyId(metadata.company_id);
        }
        if (typeof metadata.company_name === "string") {
          setCompanyName(metadata.company_name);
        }
        if (isBusinessType(metadata.business_type)) {
          setBusinessType(metadata.business_type);
        }

        setLoading(false);
      } catch (err) {
        console.error("Onboarding bootstrap error", err);
        setError(err instanceof Error ? err.message : "Failed to load onboarding");
        setLoading(false);
      }
    }

    void bootstrap();
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Onboarding is unavailable. Add Supabase environment variables.");
      return;
    }

    if (!userId) {
      setError("Session expired. Please sign in again.");
      router.replace("/signin");
      return;
    }

    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    if (!businessType) {
      setError("Business type is required.");
      return;
    }

    setSaving(true);

    try {
      await createOrUpdateCompany({
        companyId,
        name: companyName.trim(),
        businessType,
      });

      await createOrUpdateProfile({
        authUserId: userId,
        companyId,
      });

      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onboarding failed";
      console.error("Onboarding error", { error: err, message });
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-500">
        Loading onboarding...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexus-it-today-logo.png" alt="Nexus it today" className="mx-auto h-8 w-auto sm:mx-0" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Set up your company</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your company details to get started with Nexus it today.</p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Company Details</h2>
            <div>
              <label htmlFor="companyName" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Company name *
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="e.g., Acme Logistics"
                required
              />
            </div>
            <div>
              <label htmlFor="businessType" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Business type *
              </label>
              <select
                id="businessType"
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value as BusinessType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Setting up company..." : "Continue to Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
