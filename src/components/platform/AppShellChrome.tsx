"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlatform } from "./PlatformProvider";
import WorkingAsSwitcher from "./WorkingAsSwitcher";
import NexusLogo from "./NexusLogo";
import { EmptyState, ErrorState, LoadingState } from "./ui";

type NavItem = { label: string; href: string; comingLater?: boolean; hideForMerchantContext?: boolean };

const PRODUCT_NAV_ITEMS: NavItem[] = [
  { label: "Manage it", href: "/app/manage-it" },
  { label: "Create it", href: "/app/create-it" },
];

const FOUNDATION_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/foundation-it" },
  { label: "Organisations", href: "/app/foundation-it/organisations", hideForMerchantContext: true },
  { label: "Merchants", href: "/app/foundation-it/merchants" },
  { label: "Users", href: "/app/foundation-it/users" },
  { label: "Brand it", href: "/app/foundation-it/brand-it" },
  { label: "Integrate it", href: "/app/foundation-it/integrate-it" },
  { label: "Commercial rules", href: "/app/foundation-it/commercial-it" },
  { label: "Audit it", href: "/app/foundation-it/audit-it" },
  { label: "Settings", href: "/app/foundation-it/settings" },
];

const COMING_LATER: NavItem[] = [
  { label: "Book it", href: "#", comingLater: true },
  { label: "Catalogue it", href: "#", comingLater: true },
  { label: "Track it", href: "#", comingLater: true },
  { label: "Invoice it", href: "#", comingLater: true },
];

function AccountMenu() {
  const { userEmail, signOut } = usePlatform();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
        aria-label="Account menu"
      >
        {userEmail ? userEmail.slice(0, 2).toUpperCase() : "?"}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-900">{userEmail ?? "Signed in"}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NotificationBell() {
  return (
    <button
      type="button"
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300"
      aria-label="Notifications (coming later)"
      title="Notifications - coming later"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10 2a6 6 0 00-6 6v2.586l-.707.707A1 1 0 004 13h12a1 1 0 00.707-1.707L16 10.586V8a6 6 0 00-6-6zM8.5 16a1.5 1.5 0 003 0h-3z" />
      </svg>
    </button>
  );
}

export default function AppShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { loading, error, profile, activeContext, previewReadOnly, setPreviewReadOnly } = usePlatform();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState label="Loading Nexus it..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 bg-slate-50 px-6">
        <ErrorState title="We could not load your access profile" description={error} />
      </div>
    );
  }

  // Manage it and Create it are gated by their own legacy cookie-based
  // entitlement (src/proxy.ts), independent of org/merchant tenancy - ops
  // staff who use them typically have neither, so the tenancy "no access"
  // screen below must not apply to these routes.
  const legacyGatedRoute = pathname.startsWith("/app/manage-it") || pathname.startsWith("/app/create-it");
  const noAccess =
    !legacyGatedRoute && profile && !profile.isPlatformAdmin && profile.organisations.length === 0 && profile.merchants.length === 0;

  const contextOrganisationId =
    activeContext?.type === "organisation" ? activeContext.id : activeContext?.type === "merchant" ? activeContext.organisationId : null;
  const contextMerchantId = activeContext?.type === "merchant" ? activeContext.id : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/app" className="flex items-center gap-2">
            <NexusLogo organisationId={contextOrganisationId} merchantId={contextMerchantId} />
          </Link>
          <div className="flex items-center gap-3">
            <WorkingAsSwitcher />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      {previewReadOnly ? (
        <div className="sticky top-16 z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900 sm:px-6">
          Previewing as {activeContext && activeContext.type !== "platform" ? activeContext.name : "this context"} — read-only.{" "}
          <button type="button" onClick={() => setPreviewReadOnly(false)} className="ml-1 underline underline-offset-2 hover:text-amber-950">
            Exit preview
          </button>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 space-y-1">
            {PRODUCT_NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="pt-3">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Foundation it</p>
              {FOUNDATION_NAV_ITEMS.filter((item) => !(item.hideForMerchantContext && activeContext?.type === "merchant")).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="pt-3">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Coming later</p>
              {COMING_LATER.map((item) => (
                <span
                  key={item.label}
                  className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
                >
                  {item.label}
                  <span className="text-[10px] uppercase tracking-wide text-slate-300">Soon</span>
                </span>
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          {noAccess ? (
            <EmptyState
              title="No organisation or merchant access yet"
              description="Once a Nexus it platform admin or an organisation admin invites you, your organisations and merchants will appear here."
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
