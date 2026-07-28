"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MerchantSidebar from "@/components/MerchantSidebar";
import WorkspaceSelector from "@/components/WorkspaceSelector";
import PlatformBreadcrumbs from "@/components/PlatformBreadcrumbs";

type MerchantPortalShellProps = {
  children: ReactNode;
};

export default function MerchantPortalShell({ children }: MerchantPortalShellProps) {
  const pathname = usePathname() || "/portal";
  const activePath = pathname;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "Workspace access - Nexus it today";
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--nexus-bg)] text-[var(--nexus-graphite)]">
      <div className="lg:flex lg:min-h-screen">
        <MerchantSidebar activePath={activePath} />

        <div className="flex-1 lg:min-h-screen lg:overflow-hidden">
          <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.32em] text-slate-500">
                  Workspace access
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-[var(--nexus-graphite)] sm:text-4xl">
                  Oversee it
                </h1>
                <PlatformBreadcrumbs />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <WorkspaceSelector />
                <Link
                  href="/portal"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--nexus-graphite)] shadow-sm transition hover:bg-slate-50"
                >
                  Back to Oversee it
                </Link>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-[var(--nexus-graphite)] shadow-sm">
                  <span className="font-semibold">Live</span> • updated now
                </div>
              </div>
            </div>
          </div>

          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:pb-10">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
