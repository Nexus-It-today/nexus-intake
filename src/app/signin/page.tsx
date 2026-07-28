"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { mapAuthError, resolvePostSignInPath, validateEmail } from "@/lib/authOnboarding";
import { syncManageItSession } from "@/lib/manageIt";
import { supabase } from "@/lib/supabaseClient";

const SIGNIN_HERO_IMAGE =
  "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=2200&q=80";

const SIGNIN_GALLERY = [
  {
    label: "Road Freight",
    image:
      "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80",
  },
  {
    label: "Warehouse",
    image:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    label: "Air Cargo",
    image:
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
  },
  {
    label: "Containers",
    image:
      "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80",
  },
];

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entryMode, setEntryMode] = useState<"manage" | "create">("manage");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Authentication is unavailable. Add Supabase environment variables.");
      return;
    }

    if (!validateEmail(email) || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }

      const user = data.user;
      if (!user) {
        setError("Unable to verify your account right now. Please try again.");
        return;
      }

      // Sync session with server (this can now throw meaningful errors)
      try {
        await syncManageItSession(data.session?.access_token ?? null);
      } catch (syncErr) {
        const syncMessage = syncErr instanceof Error ? syncErr.message : "Session synchronization failed";
        console.error("Session sync error during signin:", syncMessage);
        setError(`Session setup failed: ${syncMessage}`);
        return;
      }

      // Resolve post-signin path
      try {
        const destination = await resolvePostSignInPath(user.id);
        const preferredDestination =
          destination === "/"
            ? entryMode === "create"
              ? "/app/create-it"
              : "/"
            : destination;
        router.replace(preferredDestination);
      } catch (resolveErr) {
        const resolveMessage = resolveErr instanceof Error ? resolveErr.message : "Failed to load your profile";
        console.error("Resolve signin path error", {
          userId: user.id,
          email: user.email ?? email.trim(),
          error: resolveErr,
        });
        setError(`Unable to access your profile: ${resolveMessage}`);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in right now.";
      console.error("Signin error:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${SIGNIN_HERO_IMAGE})` }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(167,139,250,0.3),transparent_42%),radial-gradient(circle_at_86%_20%,rgba(96,165,250,0.24),transparent_38%),linear-gradient(150deg,#050714_0%,#0a1026_44%,#121a38_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(124,58,237,0.28),transparent_33%),radial-gradient(circle_at_28%_76%,rgba(59,130,246,0.2),transparent_33%)]" />

      <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/20 bg-[rgba(13,17,32,0.64)] shadow-[0_28px_95px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden border-r border-white/10 p-8 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">NEXUS It Today</p>
          <h2 className="mt-2 text-4xl font-semibold text-white">Nexus Intelligent Transport system</h2>
          <p className="mt-3 max-w-lg text-sm text-slate-300">Operations-ready workflows for freight, warehouse and delivery teams.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {SIGNIN_GALLERY.map((tile) => (
              <div key={tile.label} className="relative h-24 overflow-hidden rounded-xl border border-white/25">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${tile.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <span className="absolute bottom-2 left-2 text-[11px] font-semibold tracking-[0.08em] text-slate-100">
                  {tile.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED] text-lg font-bold text-white shadow-lg shadow-[#7C3AED]/40">
            N
          </div>
          <p className="nexus-kicker">NEXUS It Today</p>
          <div>
            <h1 className="text-3xl font-semibold text-white">Sign in to Nexus it today.</h1>
            <p className="mt-2 text-sm text-slate-300">Nexus Intelligent Transport system</p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/15 bg-black/20 p-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMode("manage")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                entryMode === "manage"
                  ? "bg-white text-slate-900 shadow-[0_10px_22px_-16px_rgba(0,0,0,0.9)]"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              Manage it
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("create")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                entryMode === "create"
                  ? "bg-white text-slate-900 shadow-[0_10px_22px_-16px_rgba(0,0,0,0.9)]"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              Create it
            </button>
          </div>
          <p className="mt-2 px-2 text-xs text-slate-400">
            Start in {entryMode === "manage" ? "operations and oversight" : "booking and job creation"} after sign in.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
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
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium text-slate-300">
                Password
              </label>
              <a href="/forgot-password" className="text-xs text-[#A78BFA] hover:underline">
                Forgot password?
              </a>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#A78BFA] hover:underline">
            Create account
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
