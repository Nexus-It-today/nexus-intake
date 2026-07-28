"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchCompanyById, fetchProfileByUserId } from "@/lib/authOnboarding";
import AccessSetupIssueView from "@/components/AccessSetupIssueView";
import { getManageItAccessProfile, syncManageItSession } from "@/lib/manageIt";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";
import { WorkspaceCardGrid } from "@/components/WorkspaceDesignSystem";

const ALL_NAV_ITEMS = [
  { label: "Manage it", href: "/" },
  { label: "Create it", href: "/app/create-it" },
  { label: "Process it", href: "/process-it" },
  { label: "Track it", href: "/track-it" },
  { label: "Store it", href: "/store-it" },
  { label: "Account it", href: "/account-it" },
  { label: "Report it", href: "/report-it" },
  { label: "Improve it", href: "/improve-it" },
  { label: "Tell it", href: "/tell-it" },
];

const manageItModules = [
  {
    title: "Create it",
    description: "Create new work from any source.",
    href: "/app/create-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 5v14M5 12h14" /></svg>),
  },
  {
    title: "Upload it",
    description: "Upload transport documents for OCR and review.",
    href: "/portal/book-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 20h14" /></svg>),
  },
  {
    title: "Process it",
    description: "Prepare jobs and send to Track-POD.",
    href: "/process-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M5 12h14" /><path d="M13 7l5 5-5 5" /><rect x="3" y="4" width="7" height="16" rx="1.5" /></svg>),
  },
  {
    title: "Track it",
    description: "Track vehicles, jobs and deliveries in real time.",
    href: "/track-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>),
  },
  {
    title: "Document it",
    description: "Manage the complete document-to-delivery workflow.",
    href: "/app/manage-it/document-it",
    requiresManageIt: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>),
  },
  {
    title: "Search it",
    description: "Locate documents, draft jobs and deliveries instantly.",
    href: "/app/manage-it/search-it",
    requiresManageIt: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>),
  },
  {
    title: "Route it",
    description: "Dispatch drivers, manage consignments and live routing.",
    href: "/route-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M3 12h18" /><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /></svg>),
  },
  {
    title: "Store it",
    description: "Warehouse, inventory and documents.",
    href: "/store-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M4 8l8-5 8 5v11H4V8z" /><path d="M12 3v18" /><path d="M8 12h8" /></svg>),
  },
  {
    title: "Account it",
    description: "Customers, invoicing and payments.",
    href: "/account-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 12a4 4 0 100-8 4 4 0 000 8z" /><path d="M4 21v-1a4 4 0 014-4h8a4 4 0 014 4v1" /></svg>),
  },
  {
    title: "Report it",
    description: "Dashboards, KPIs and business insights.",
    href: "/report-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M4 6h16" /><path d="M7 6v12" /><path d="M12 10v8" /><path d="M17 14v4" /><path d="M4 18h16" /></svg>),
  },
  {
    title: "Manage it",
    description: "Oversee operations and performance.",
    href: "/app/manage-it",
    requiresManageIt: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>),
  },
  {
    title: "Improve it",
    description: "Feedback, automation and continuous improvement.",
    href: "/improve-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>),
  },
  {
    title: "Send it",
    description: "Inactive placeholder module for future handoff and dispatch expansion.",
    href: "/send-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4z" /></svg>),
  },
  {
    title: "Get it",
    description: "Inactive placeholder module for future returns and inbound intake operations.",
    href: "/get-it",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>),
  },
];

const createItMethods = [
  { title: "Book it", description: "Customer booking forms for fast, structured job requests.", href: "/booking-forms/public", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>) },
  { title: "Enter it", description: "Manual job entry for operations teams.", href: "/order-input", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><path d="M17.5 3.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 8.5-8.5z" /></svg>) },
  { title: "Upload it", description: "Document uploads that convert paperwork into dispatch-ready work.", href: "/portal/documents", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>) },
  { title: "Email it", description: "Convert inbound booking emails into jobs automatically.", href: "/app/create-it", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>) },
  { title: "Connect it", description: "Use API integrations to push jobs from external systems.", href: "/build-it", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M15 7h4v4" /><path d="M9 17H5v-4" /><path d="M19 7l-6 6" /><path d="M5 13l6-6" /></svg>) },
  { title: "Import it", description: "CSV and spreadsheet imports for batch creation at scale.", href: "/portal/book-it", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>) },
  { title: "Embed it", description: "Publish booking forms on your own website.", href: "/booking-forms/embedded", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>) },
  { title: "Shopify", description: "Sync orders from your Shopify store.", href: "/booking-forms/shopify", status: "live", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M6 20l1.2-12h9.6L18 20z" /><path d="M9 9c0-3 1.8-5 4-5s4 2 4 5" /></svg>) },
  {
    title: "WooCommerce",
    description: "Deferred until Wodely replacement is confirmed fully live and stable.",
    href: "/booking-forms/woocommerce",
    status: "coming-soon",
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M6 7h12l-1 10H7L6 7z" /><path d="M9 7a3 3 0 116 0" /></svg>),
  },
];

const QUICK_ACTIONS = [
  { label: "Create new job", href: "/app/create-it", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M12 5v14M5 12h14" /></svg>) },
  { label: "View today's jobs", href: "/orders", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>) },
  { label: "Upload document", href: "/portal/documents", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>) },
  { label: "Track a job", href: "/track-it", icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>) },
];

const RECENT_ACTIVITY = [
  { label: "12 new bookings received", time: "5m ago", dot: "bg-emerald-500" },
  { label: "8 jobs updated", time: "15m ago", dot: "bg-sky-500" },
  { label: "Driver check-in: John D.", time: "32m ago", dot: "bg-emerald-500" },
];

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=2200&q=80";

const HERO_GALLERY = [
  {
    title: "Road Freight",
    image:
      "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Warehouse Ops",
    image:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Air Cargo",
    image:
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Container Freight",
    image:
      "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80",
  },
];

type AccessSetupIssue = { title: string; details: string };

export default function HubPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [canAccessManageIt, setCanAccessManageIt] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<AccessSetupIssue | null>(null);
  const [activeTab, setActiveTab] = useState<"manage" | "create">("manage");
  const [workspaceRole, setWorkspaceRole] = useState<"admin" | "merchant" | "customer">("admin");
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function redirectOnce(target: string) {
      if (hasRedirectedRef.current || cancelled) return;
      hasRedirectedRef.current = true;
      router.replace(target);
    }

    async function bootstrap() {
      setAuthLoading(true);
      setAccessIssue(null);
      try {
        if (!supabase) { if (!cancelled) setAuthLoading(false); return; }
        const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
        const user = userData.user ?? sessionData.session?.user ?? null;
        const accessToken = sessionData.session?.access_token ?? null;
        if (!user) { try { await syncManageItSession(null); } catch {} redirectOnce("/signin"); return; }
        try { await syncManageItSession(accessToken); } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : String(syncError);
          if (!cancelled) { setAccessIssue({ title: "Access setup issue", details: `Session sync failed: ${message}` }); setAuthLoading(false); }
          return;
        }
        let profileRecord;
        try { profileRecord = await fetchProfileByUserId(user.id); } catch (profileError) {
          const message = profileError instanceof Error ? profileError.message : String(profileError);
          if (!cancelled) { setAccessIssue({ title: "Access setup issue", details: `Profile fetch failed: ${message}` }); setAuthLoading(false); }
          return;
        }
        if (!profileRecord) { redirectOnce("/onboarding"); return; }
        if (profileRecord.company_id) {
          try {
            const company = await fetchCompanyById(profileRecord.company_id);
            if (!cancelled) setCompanyName(company?.name ?? null);
          } catch (companyError) {
            const message = companyError instanceof Error ? companyError.message : String(companyError);
            if (!cancelled) { setAccessIssue({ title: "Access setup issue", details: `Company fetch failed: ${message}` }); setAuthLoading(false); }
            return;
          }
        }
        if (!cancelled) setUserEmail(user.email ?? null);
        try { const profile = await getManageItAccessProfile(); if (!cancelled) setCanAccessManageIt(profile.canAccessManageIt); }
        catch { if (!cancelled) setCanAccessManageIt(false); }
        if (!cancelled) setAuthLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) { setAccessIssue({ title: "Access setup issue", details: message }); setAuthLoading(false); }
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [router]);

  async function handleSignOut() {
    setSignOutError(null);
    if (!supabase) { router.replace("/signin"); return; }
    const { error } = await supabase.auth.signOut();
    if (error) { setSignOutError("Unable to sign out right now. Please try again."); return; }
    await syncManageItSession(null);
    router.replace("/signin");
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-500">
        Loading workspace…
      </div>
    );
  }

  if (accessIssue) {
    return (
      <AccessSetupIssueView
        title={accessIssue.title}
        heading="We found a session, but setup could not be completed."
        details={accessIssue.details}
        hint="Try refreshing or signing out and back in. Your session remains active."
      />
    );
  }

  const sidebarNavItems = ALL_NAV_ITEMS.filter((item) => item.href !== "/" || canAccessManageIt);
  
  // Filter modules based on user type
  const moduleAccessMap: Record<"admin" | "merchant" | "customer", Set<string>> = {
    admin: new Set(manageItModules.map(m => m.title)), // All modules
    merchant: new Set(["Create it", "Upload it", "Process it", "Track it", "Store it", "Account it", "Report it", "Improve it", "Send it", "Get it"]),
    customer: new Set(["Create it", "Upload it", "Process it", "Track it", "Store it", "Account it", "Report it", "Send it", "Get it"]),
  };
  
  const createAccessMap: Record<"admin" | "merchant" | "customer", Set<string>> = {
    admin: new Set(createItMethods.map(m => m.title)), // All methods
    merchant: new Set(["Book it", "Enter it", "Upload it", "Email it", "Connect it", "Import it"]),
    customer: new Set(["Book it"]),
  };
  
  const visibleManageModules = manageItModules.filter((mod) => {
    const canAccess = !mod.requiresManageIt || canAccessManageIt;
    const userCanSee = moduleAccessMap[workspaceRole as keyof typeof moduleAccessMap]?.has(mod.title);
    return canAccess && userCanSee;
  });
  
  const visibleCreateMethods = createItMethods.filter((method) => {
    const userCanSee = createAccessMap[workspaceRole as keyof typeof createAccessMap]?.has(method.title);
    return userCanSee;
  });

  return (
    <div className="flex min-h-screen text-slate-900 nexus-page-enter">
      {/* Left: Product catalogue */}
      <Sidebar 
        items={sidebarNavItems} 
        activePath="/" 
        userType={workspaceRole as "admin" | "merchant" | "customer"}
        onUserTypeChange={setWorkspaceRole}
      />

      {/* Centre: Workspace */}
      <div className="flex flex-1 flex-col overflow-auto">

        {/* Workspace heading bar */}
        <div className="sticky top-0 z-10 overflow-hidden border-b border-violet-500/20 bg-[#070916] px-8 py-6 text-white">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45"
            style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,0.34),transparent_44%),radial-gradient(circle_at_80%_18%,rgba(59,130,246,0.24),transparent_38%),linear-gradient(140deg,#060913_0%,#11122b_45%,#131738_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">NEXUS It Today</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                Manage it
              </h1>
              <p className="mt-2 max-w-2xl text-base text-slate-200">
                Nexus Intelligent Transport System.
              </p>

              {/* ── Workspace role switcher ────────────────────── */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Workspace</span>
                <div className="flex items-center rounded-xl border border-white/20 bg-white/10 p-1 text-xs">
                  {([
                    { role: "admin" as const, label: "Admin", description: "Full platform access" },
                    { role: "merchant" as const, label: "Merchant", description: "Customer-facing portal" },
                    { role: "customer" as const, label: "Customer", description: "End-customer view" },
                  ]).map(({ role, label }) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setWorkspaceRole(role)}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-semibold transition ${
                        workspaceRole === role
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-200 hover:text-white"
                      }`}
                    >
                      {workspaceRole === role && (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-300">
                  {workspaceRole === "admin" && "Full platform — all modules visible"}
                  {workspaceRole === "merchant" && "Merchant portal — booking and tracking"}
                  {workspaceRole === "customer" && "Customer view — create and track jobs"}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="hidden grid-cols-2 gap-2 lg:grid">
                {HERO_GALLERY.map((tile) => (
                  <div
                    key={tile.title}
                    className="relative h-20 w-40 overflow-hidden rounded-xl border border-white/25"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${tile.image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 shadow-sm transition hover:border-white/35">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5" /><path d="M10 17a2 2 0 104 0" /></svg>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7C3AED] text-[11px] font-bold text-white">3</span>
                  Notifications
                </button>
                <button type="button" className="flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#7C3AED]/30 transition hover:bg-[#6d28d9]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                  Product view
                </button>
              </div>
              <div className="flex items-center gap-3">
                {(companyName ?? userEmail) ? <span className="text-xs text-slate-300">{companyName ?? userEmail}</span> : null}
                <button type="button" onClick={handleSignOut} className="rounded-lg border border-white/25 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/10">
                  Sign out
                </button>
                {signOutError ? <span className="text-xs text-red-500">{signOutError}</span> : null}
              </div>
            </div>
          </div>

          {/* Live status */}
          <div className="relative mt-4 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-slate-200">Live &bull; updated 2m ago</span>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-8 py-7">

          {/* Toggle */}
          <div className="mb-8 flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 text-sm">
            <button type="button" onClick={() => setActiveTab("manage")} className={`flex items-center gap-2 rounded-lg px-6 py-2 font-semibold transition ${activeTab === "manage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
              Manage it
            </button>
            <button type="button" onClick={() => setActiveTab("create")} className={`flex items-center gap-2 rounded-lg px-6 py-2 font-semibold transition ${activeTab === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
              Create it
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "manage" ? (
            <div className="nexus-page-enter">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleManageModules.map((s) => (
                  <Link key={s.href + s.title} href={s.href} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#7C3AED]/35 hover:shadow-[0_8px_24px_-8px_rgba(124,58,237,0.18)]">
                    <div className="mb-6 flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C3AED]/10 text-[#7C3AED] transition group-hover:bg-[#7C3AED] group-hover:text-white">{s.icon}</div>
                      <span className="text-lg font-light text-[#7C3AED] opacity-0 transition group-hover:opacity-100">→</span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{s.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="nexus-page-enter space-y-7">
              <div className="nexus-card flex items-center justify-between gap-5 rounded-[28px] p-6">
                <div className="flex items-center gap-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                  <div>
                    <p className="nexus-kicker">Create it</p>
                    <h2 className="mt-0.5 text-2xl font-semibold text-slate-900">Choose how you'd like to create work.</h2>
                    <p className="mt-1 text-sm text-slate-600">Each method below is an intake path inside the Create it product.</p>
                  </div>
                </div>
                <div className="hidden shrink-0 items-center rounded-full border border-slate-200 bg-white p-1 text-sm sm:flex">
                  <button type="button" className="rounded-full bg-[#7C3AED] px-4 py-1.5 font-semibold text-white">Grid</button>
                  <button type="button" className="rounded-full px-4 py-1.5 font-semibold text-slate-500 hover:text-slate-900">List</button>
                </div>
              </div>
              <WorkspaceCardGrid items={visibleCreateMethods} />
            </div>
          )}

          {/* Bottom panels */}
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="nexus-card rounded-[24px] p-5">
              <p className="text-xl font-semibold text-slate-900">Quick actions</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {QUICK_ACTIONS.map((action) => (
                  <Link key={action.label} href={action.href} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center text-xs font-medium text-slate-600 transition hover:border-[#7C3AED]/40 hover:text-[#7C3AED]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">{action.icon}</span>
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="nexus-card rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold text-slate-900">Recent activity</p>
                <Link href="/orders" className="text-sm font-semibold text-[#7C3AED] hover:underline">View all</Link>
              </div>
              <div className="mt-4 space-y-3">
                {RECENT_ACTIVITY.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                      <span className="text-sm text-slate-700">{item.label}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Right: Notifications + Support */}
      <RightPanel />
    </div>
  );
}
