"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { getManageItAccessProfile } from "@/lib/manageIt";
import { getTitleForPath } from "@/lib/routeTitles";

const adminNavItems = [
  {
    label: "Oversee it",
    href: "/dashboard",
    children: [
      { label: "Today's Orders", href: "/orders" },
      { label: "Organisations", href: "/app/manage-it?section=companies" },
      { label: "Merchants", href: "/merchants" },
      { label: "Integrate it", href: "/integrate-it" },
    ],
  },
  {
    label: "Create it",
    href: "/app/create-it",
    children: [
      { label: "Create Home", href: "/app/create-it" },
      { label: "Booking Forms", href: "/booking-forms" },
      { label: "Order Input", href: "/order-input" },
    ],
  },
  {
    label: "Process it",
    href: "/process-it",
    children: [
      { label: "Review Queue", href: "/review-it" },
      { label: "Track-POD Queue", href: "/track-it" },
      { label: "Dispatch Queue", href: "/process-it?filter=sent" },
      { label: "Exceptions", href: "/process-it?filter=error" },
    ],
  },
  {
    label: "Manage it",
    href: "/app/manage-it",
    children: [
      { label: "Organisations", href: "/app/manage-it?section=companies" },
      { label: "Merchants", href: "/merchants" },
      { label: "Customers", href: "/app/manage-it?section=customers" },
      { label: "Search", href: "/app/manage-it/search-it" },
    ],
  },
  {
    label: "Integrate it",
    href: "/integrate-it",
    children: [
      { label: "Providers", href: "/integrate-it" },
      { label: "Health", href: "/integrate-it" },
    ],
  },
  { label: "Report it", href: "/report-it", children: [{ label: "Reports", href: "/report-it" }] },
  { label: "Store it", href: "/store-it", children: [{ label: "Store Home", href: "/store-it" }] },
  { label: "Account it", href: "/account-it", children: [{ label: "Account Home", href: "/account-it" }] },
  { label: "Settings", href: "/settings", children: [{ label: "Settings Home", href: "/settings" }] },
];

const merchantNavItems = [
  {
    label: "Oversee it",
    href: "/portal/orders",
    children: [
      { label: "Today's Orders", href: "/portal/orders" },
      { label: "Track it", href: "/portal/track-it" },
      { label: "Customers", href: "/portal/customers" },
    ],
  },
  {
    label: "Create it",
    href: "/portal/create-it",
    children: [
      { label: "Create Home", href: "/portal/create-it" },
      { label: "Book it", href: "/portal/book-it" },
      { label: "Intake", href: "/portal/intake" },
    ],
  },
  {
    label: "Process it",
    href: "/process-it",
    children: [
      { label: "Review Queue", href: "/review-it" },
      { label: "Track-POD Queue", href: "/track-it" },
      { label: "Dispatch Queue", href: "/process-it?filter=sent" },
      { label: "Exceptions", href: "/process-it?filter=error" },
    ],
  },
  {
    label: "Manage it",
    href: "/portal/manage-it",
    children: [
      { label: "Merchant Workspace", href: "/portal/manage-it" },
      { label: "Customers", href: "/portal/customers" },
      { label: "Documents", href: "/portal/documents" },
    ],
  },
  {
    label: "Integrate it",
    href: "/integrate-it",
    children: [
      { label: "Providers", href: "/integrate-it" },
      { label: "Coming Soon", href: "/integrate-it" },
    ],
  },
  { label: "Report it", href: "/portal/reports", children: [{ label: "Reports", href: "/portal/reports" }] },
  { label: "Store it", href: "/store-it", children: [{ label: "Store Home", href: "/store-it" }] },
  { label: "Account it", href: "/account-it", children: [{ label: "Account Home", href: "/account-it" }] },
  { label: "Settings", href: "/portal/settings", children: [{ label: "Settings Home", href: "/portal/settings" }] },
];
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const activePath = pathname;
  const pageTitle = getTitleForPath(activePath);
  const isPortal = pathname.startsWith("/portal");
  const [showManageIt, setShowManageIt] = useState(pathname.startsWith("/manage-it"));

  useEffect(() => {
    // keep browser title in sync with page title mapping
    if (typeof document !== "undefined") {
      document.title = `${pageTitle} - Nexus it today`;
    }
  }, [pageTitle]);

  useEffect(() => {
    let active = true;

    async function hydrateAccess() {
      try {
        const profile = await getManageItAccessProfile();
        if (active) {
          setShowManageIt(profile.canAccessManageIt || pathname.startsWith("/manage-it"));
        }
      } catch {
        if (active) {
          setShowManageIt(pathname.startsWith("/manage-it"));
        }
      }
    }

    void hydrateAccess();

    return () => {
      active = false;
    };
  }, [pathname]);

  const filteredNavItems = isPortal
    ? merchantNavItems
    : adminNavItems.filter(
        (item) => item.label !== "Manage it" || showManageIt || pathname.startsWith("/manage-it")
      );

  return (
    <div className="min-h-screen text-[var(--nexus-graphite)] nexus-page-enter">
      <div className="lg:flex lg:min-h-screen">
        <Sidebar items={filteredNavItems} activePath={activePath} />

        <div className="flex-1 lg:min-h-screen lg:overflow-hidden">
          <div className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
            <Header title={pageTitle} subtitle="Everything you need to build, operate and grow your transport business." />
          </div>

          <div className="flex h-full">
            <main className="min-w-0 flex-1 bg-transparent px-4 py-6 sm:px-6 lg:px-8 lg:pb-10">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
