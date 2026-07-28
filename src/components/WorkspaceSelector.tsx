"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchProfileByUserId } from "@/lib/authOnboarding";

type WorkspaceKind = "admin" | "merchant" | "customer";

type WorkspaceOption = {
  key: WorkspaceKind;
  label: string;
  route: string;
};

const WORKSPACE_OPTIONS: WorkspaceOption[] = [
  { key: "admin", label: "Admin", route: "/dashboard" },
  { key: "merchant", label: "Merchant", route: "/portal" },
  { key: "customer", label: "Customer", route: "/customer" },
];

const STORAGE_KEY = "nexus.workspace.selector.v1";

function inferWorkspace(pathname: string): WorkspaceKind {
  if (pathname.startsWith("/customer")) return "customer";
  if (pathname.startsWith("/portal")) return "merchant";
  return "admin";
}

type AccessSummary = {
  hasOrganisationAccess: boolean;
  hasMerchantAccess: boolean;
  isCustomer: boolean;
};

/**
 * These tabs used to be pure decoration: any signed-in user could click
 * "Admin" and land on /dashboard regardless of whether they actually had any
 * administrative access. They now reflect the real Sprint 1 access profile
 * (organisation/merchant memberships, via /api/platform/access-profile) plus
 * the legacy customer-portal role flag, and disable options the current user
 * genuinely does not have.
 */
export default function WorkspaceSelector() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceKind>(() => inferWorkspace(pathname));
  const [access, setAccess] = useState<AccessSummary | null>(null);

  useEffect(() => {
    const inferred = inferWorkspace(pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(inferred);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, inferred);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as WorkspaceKind | null;
    if (!saved) return;
    if (["admin", "merchant", "customer"].includes(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspace(saved);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      const empty: AccessSummary = { hasOrganisationAccess: false, hasMerchantAccess: false, isCustomer: false };
      if (!supabase) {
        if (!cancelled) setAccess(empty);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        if (!cancelled) setAccess(empty);
        return;
      }

      try {
        const [accessProfilePayload, legacyProfile] = await Promise.all([
          fetch("/api/platform/access-profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then((response) => response.json())
            .catch(() => null),
          fetchProfileByUserId(session.user.id).catch(() => null),
        ]);
        if (cancelled) return;

        const profile = accessProfilePayload?.profile;
        setAccess({
          hasOrganisationAccess: Boolean(profile?.isPlatformAdmin || (profile?.organisations?.length ?? 0) > 0),
          hasMerchantAccess: Boolean(profile?.isPlatformAdmin || (profile?.merchants?.length ?? 0) > 0),
          isCustomer: (legacyProfile?.role ?? "").toLowerCase() === "customer",
        });
      } catch {
        if (!cancelled) setAccess(empty);
      }
    }

    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  function isAvailable(key: WorkspaceKind): boolean {
    // Avoid a flash of disabled buttons while the access check is in flight.
    if (!access) return true;
    if (key === "admin") return access.hasOrganisationAccess;
    if (key === "merchant") return access.hasMerchantAccess;
    return access.isCustomer;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-300/30">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace</p>
      <div className="mt-1 flex gap-1">
        {WORKSPACE_OPTIONS.map((option) => {
          const active = workspace === option.key;
          const available = isAvailable(option.key);
          return (
            <button
              key={option.key}
              type="button"
              disabled={!available}
              title={available ? undefined : "You do not have access to this workspace"}
              onClick={() => {
                if (!available) return;
                setWorkspace(option.key);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(STORAGE_KEY, option.key);
                }
                router.push(option.route);
              }}
              className={
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition " +
                (active
                  ? "bg-blue-600 text-white"
                  : available
                    ? "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    : "cursor-not-allowed border border-slate-100 bg-slate-50 text-slate-300")
              }
              aria-pressed={active}
              aria-disabled={!available}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
