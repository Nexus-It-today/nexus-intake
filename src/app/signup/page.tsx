"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  BusinessType,
  mapAuthError,
  resolvePostSignInPath,
  validateEmail,
  validatePassword,
  validatePhone,
} from "@/lib/authOnboarding";
import { syncManageItSession } from "@/lib/manageIt";
import { supabase } from "@/lib/supabaseClient";

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "courier", label: "Courier" },
  { value: "fulfilment", label: "Fulfilment" },
  { value: "retailer", label: "Retailer" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "marketplace_seller", label: "Marketplace Seller" },
  { value: "other", label: "Other" },
];

export default function SignUpPage() {
  const router = useRouter();
  const [companyId] = useState(() => crypto.randomUUID());
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("courier");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const token = (params.get("invite") ?? "").trim();
    const emailParam = (params.get("email") ?? "").trim();

    if (emailParam) {
      setEmail(emailParam);
    }

    if (!token) {
      setInviteToken(null);
      setInviteCompanyId(null);
      return;
    }

    let active = true;
    setInviteLoading(true);
    setInviteToken(token);
    setError(null);

    void fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          invite?: {
            email?: string;
            contactName?: string | null;
            companyId?: string;
          };
        };

        if (!active) return;

        if (!response.ok || !payload.invite) {
          setInviteToken(null);
          setInviteCompanyId(null);
          setError(payload.error ?? "Invite link is invalid or expired");
          return;
        }

        if (payload.invite.email) {
          setEmail(payload.invite.email);
        }
        if (payload.invite.contactName && !contactName.trim()) {
          setContactName(payload.invite.contactName);
        }
        setInviteCompanyId(payload.invite.companyId ?? null);
        setInfo("Invite verified. Create your password to access the customer portal.");
      })
      .catch(() => {
        if (!active) return;
        setInviteToken(null);
        setInviteCompanyId(null);
        setError("Invite validation failed. Please request a new invite link.");
      })
      .finally(() => {
        if (active) {
          setInviteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [contactName]);

  useEffect(() => {
    async function bootstrap() {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const { data: sessionData } = await supabase.auth.getSession();
          await syncManageItSession(sessionData.session?.access_token ?? null);
          const destination = await resolvePostSignInPath(data.user.id);
          router.replace(destination);
        }
      } catch (err) {
        console.error("Signup bootstrap check failed", err);
      }
    }

    void bootstrap();
  }, [router]);

  const inviteMode = Boolean(inviteToken);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Authentication is unavailable. Add Supabase environment variables.");
      return;
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email.");
      return;
    }

    if (!inviteMode && (!companyName.trim() || !contactName.trim())) {
      setError("Company and contact names are required.");
      return;
    }

    if (!inviteMode && !validatePhone(contactPhone)) {
      setError("Please provide a valid phone number.");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            company_name: inviteMode ? "Customer Portal" : companyName.trim(),
            contact_name: contactName.trim(),
            contact_phone: contactPhone.trim(),
            business_type: inviteMode ? "other" : businessType,
            company_id: inviteMode ? inviteCompanyId ?? companyId : companyId,
            invite_token: inviteToken,
          },
        },
      });

      if (signUpError) {
        console.error("Supabase signup failed", { error: signUpError, email: email.trim() });
        setError(mapAuthError(signUpError.message));
        return;
      }

      if (!data.user) {
        setError("Signup succeeded, but your session is not ready yet. Please continue from sign in.");
        return;
      }

      if (inviteMode && inviteToken) {
        const acceptResponse = await fetch("/api/auth/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: inviteToken,
            userId: data.user.id,
            email: email.trim(),
            fullName: contactName.trim(),
          }),
        });

        const acceptPayload = (await acceptResponse.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!acceptResponse.ok) {
          setError(acceptPayload.error ?? "Failed to accept invite");
          return;
        }
      }

      // Sync session with server (this can now throw meaningful errors)
      try {
        await syncManageItSession(data.session?.access_token ?? null);
      } catch (syncErr) {
        const syncMessage = syncErr instanceof Error ? syncErr.message : "Session synchronization failed";
        console.error("Session sync error during signup:", syncMessage);
        setError(`Session setup failed: ${syncMessage}`);
        return;
      }

      try {
        const destination = await resolvePostSignInPath(data.user.id);
        router.replace(destination);
      } catch (resolveErr) {
        const resolveMessage = resolveErr instanceof Error ? resolveErr.message : "Failed to determine onboarding status";
        console.error("Resolve signup path error", {
          userId: data.user.id,
          email: data.user.email ?? email.trim(),
          error: resolveErr,
        });
        setError(`Profile setup failed: ${resolveMessage}`);
      }
    } catch (err) {
      console.error("Unexpected signup error:", err);
      if (err instanceof Error) {
        setError(`${err.name}: ${err.message}`);
      } else {
        setError(JSON.stringify(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#111827] flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED] text-lg font-bold text-white shadow-lg shadow-[#7C3AED]/40">
          N
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7C3AED]">NEXUS It Today</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Create your Nexus it today account</h1>
          <p className="mt-1 text-sm text-slate-400">
            {inviteMode ? "Customer portal invite" : "Intelligent Transport by Nexus"}
          </p>
        </div>
      </div>

      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 backdrop-blur p-8 shadow-2xl">
        {inviteLoading ? (
          <p className="mb-4 rounded-xl border border-slate-400/30 bg-slate-500/10 px-3 py-2 text-xs text-slate-200">
            Validating invite link...
          </p>
        ) : null}

        {info ? (
          <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {info}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {!inviteMode ? (
          <div>
            <label htmlFor="companyName" className="mb-1.5 block text-xs font-medium text-slate-300">
              Company Name
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Nexus Logistics Ltd"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>
          ) : null}

          <div>
            <label htmlFor="contactName" className="mb-1.5 block text-xs font-medium text-slate-300">
              Contact Name
            </label>
            <input
              id="contactName"
              type="text"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>

          {!inviteMode ? (
          <div>
            <label htmlFor="contactPhone" className="mb-1.5 block text-xs font-medium text-slate-300">
              Phone Number
            </label>
            <input
              id="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="+44 20 1234 5678"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>
          ) : null}

          {!inviteMode ? (
          <div>
            <label htmlFor="businessType" className="mb-1.5 block text-xs font-medium text-slate-300">
              Business Type
            </label>
            <select
              id="businessType"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value as BusinessType)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type.value} value={type.value} className="bg-[#111827]">
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@yourcompany.com"
              readOnly={inviteMode}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 chars, upper/lowercase and number"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-medium text-slate-300">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#7C3AED]/30 transition hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/signin" className="text-[#A78BFA] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
