"use client";

import { useMemo, useState } from "react";
import { usePlatform } from "./PlatformProvider";

/**
 * The "Working as" context switcher. Every option shown here comes from
 * profile.organisations / profile.merchants, which the server derived from
 * real membership rows (see getAccessProfile). Selecting an option asks the
 * server to re-validate and set the context (see /api/platform/context) -
 * nothing here is trusted client-side on its own.
 */
export default function WorkingAsSwitcher() {
  const { profile, activeContext, switchContext } = usePlatform();
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!activeContext || activeContext.type === "platform") return "Nexus it platform";
    return activeContext.name;
  }, [activeContext]);

  const roleLabel = useMemo(() => {
    if (!activeContext || activeContext.type === "platform") return "Platform admin";
    return activeContext.role.replaceAll("_", " ");
  }, [activeContext]);

  if (!profile) return null;

  const hasChoices = profile.organisations.length + profile.merchants.length > 1 || profile.isPlatformAdmin;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-slate-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Working as</span>
          <span className="font-semibold text-slate-900">{label}</span>
        </span>
        <span className="ml-1 text-xs text-slate-400">{roleLabel}</span>
        {hasChoices ? <span className="ml-1 text-slate-400">▾</span> : null}
      </button>

      {open && hasChoices ? (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {profile.isPlatformAdmin ? (
            <button
              type="button"
              onClick={() => {
                void switchContext({ type: "platform" });
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">Nexus it platform</span>
              <span className="text-xs text-slate-400">Platform admin</span>
            </button>
          ) : null}

          {profile.organisations.length > 0 ? (
            <div className="border-b border-slate-100 py-1">
              <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Organisations</p>
              {profile.organisations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    void switchContext({ type: "organisation", id: org.id });
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{org.name}</span>
                  <span className="text-xs text-slate-400">{org.role.replaceAll("_", " ")}</span>
                </button>
              ))}
            </div>
          ) : null}

          {profile.merchants.length > 0 ? (
            <div className="py-1">
              <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Merchants</p>
              {profile.merchants.map((merchant) => (
                <button
                  key={merchant.id}
                  type="button"
                  onClick={() => {
                    void switchContext({ type: "merchant", id: merchant.id });
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{merchant.name}</span>
                  <span className="text-xs text-slate-400">{merchant.role.replaceAll("_", " ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
