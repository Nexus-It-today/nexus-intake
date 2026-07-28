"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { merchantNavItems } from "@/lib/merchantNavigation";

type MerchantSidebarProps = {
  activePath: string;
};

const navIcons: Record<string, ReactNode> = {
  Home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  Upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  FileText: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="13" x2="8" y2="13" />
      <line x1="12" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Truck: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="1" y="6" width="22" height="12" rx="2" />
      <path d="M1 12h22" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  ),
  FileCheck: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 14l2 2 4-4" />
    </svg>
  ),
  BarChart3: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="19" x2="19" y2="19" />
      <rect x="6" y="14" width="3" height="5" />
      <rect x="15" y="9" width="3" height="10" />
      <rect x="10.5" y="11" width="3" height="8" />
    </svg>
  ),
  Box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  PlusCircle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
};

export default function MerchantSidebar({ activePath }: MerchantSidebarProps) {
  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <div className="h-8 w-8 rounded-lg bg-[var(--nexus-purple)]" />
        <span className="font-semibold text-[var(--nexus-graphite)]">Nexus it today workspace</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {merchantNavItems.map((item) => {
          const isActive = activePath === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-purple-50 text-[var(--nexus-purple)]"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {navIcons[item.icon]}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-6 py-4">
        <p className="text-xs text-slate-500">Workspace v0.5.0</p>
      </div>
    </aside>
  );
}
