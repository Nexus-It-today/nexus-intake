"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AccessProfile, ActiveContext, StoredContextRequest } from "@/lib/platform/types";

type SwitchRequest = StoredContextRequest | { type: "platform" };

type PlatformContextValue = {
  loading: boolean;
  error: string | null;
  accessToken: string | null;
  userEmail: string | null;
  profile: AccessProfile | null;
  activeContext: ActiveContext | null;
  refresh: () => Promise<void>;
  switchContext: (request: SwitchRequest) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Master Admin "preview as Merchant" read-only mode. Only ever set to true
   * for platform admins (enforced in setPreviewReadOnly below) - never a
   * substitute for real permission checks, just a UI-level guard that hides
   * mutating controls while an admin is looking through a merchant's eyes.
   */
  previewReadOnly: boolean;
  setPreviewReadOnly: (value: boolean) => void;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within PlatformProvider");
  }
  return ctx;
}

export default function PlatformProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);
  const [previewReadOnly, setPreviewReadOnlyState] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setAccessToken(session.access_token);
    setUserEmail(session.user.email ?? null);

    try {
      const response = await fetch("/api/platform/context", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await response.json()) as { profile?: AccessProfile; activeContext?: ActiveContext; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load access profile.");
      }
      setProfile(payload.profile ?? null);
      setActiveContext(payload.activeContext ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access profile.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Standard session-check-on-mount pattern: load() sets profile/context
    // state after resolving the current Supabase session and access profile.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const switchContext = useCallback(
    async (request: SwitchRequest) => {
      if (!accessToken) return;
      const response = await fetch("/api/platform/context", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as { activeContext?: ActiveContext };
      if (response.ok && payload.activeContext) {
        setActiveContext(payload.activeContext);
      }
    },
    [accessToken]
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/login");
  }, [router]);

  const setPreviewReadOnly = useCallback(
    (value: boolean) => {
      // Only platform admins can ever enter preview mode - anyone else's
      // request to enable it is silently ignored.
      if (value && !profile?.isPlatformAdmin) return;
      setPreviewReadOnlyState(value);
    },
    [profile]
  );

  const value = useMemo<PlatformContextValue>(
    () => ({
      loading,
      error,
      accessToken,
      userEmail,
      profile,
      activeContext,
      refresh: load,
      switchContext,
      signOut,
      previewReadOnly,
      setPreviewReadOnly,
    }),
    [loading, error, accessToken, userEmail, profile, activeContext, load, switchContext, signOut, previewReadOnly, setPreviewReadOnly]
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
