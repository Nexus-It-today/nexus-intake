"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { mapAuthError, resolvePostSignInPath, validateEmail } from "@/lib/authOnboarding";
import { syncManageItSession } from "@/lib/manageIt";
import { supabase } from "@/lib/supabaseClient";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexus-it-today-logo.png" alt="Nexus it today" className="h-8 w-auto" />
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to Nexus it today</h1>
          <p className="text-sm text-slate-500">Operations-ready workflows for freight, warehouse and delivery teams.</p>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMode("manage")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                entryMode === "manage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
              }`}
            >
              Manage it
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("create")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                entryMode === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
              }`}
            >
              Create it
            </button>
          </div>
          <p className="mt-2 px-2 text-xs text-slate-500">
            Start in {entryMode === "manage" ? "operations and oversight" : "booking and job creation"} after sign in.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@yourcompany.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Password
              </label>
              <a href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
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
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-blue-600 hover:text-blue-700 hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
