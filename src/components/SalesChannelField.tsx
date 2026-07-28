"use client";

import { useEffect, useMemo, useState } from "react";
import type { SalesChannelRecord } from "@/lib/salesChannels";

type Props = {
  companyId: string;
  value: string;
  selectedId: string;
  onChange: (next: { id: string; name: string }) => void;
  label?: string;
  helperText?: string;
};

export default function SalesChannelField({
  companyId,
  value,
  selectedId,
  onChange,
  label = "Sales Channel",
  helperText,
}: Props) {
  const [query, setQuery] = useState(value);
  const [items, setItems] = useState<SalesChannelRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!companyId || !open) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetch(
        `/api/reference/sales-channels?company_id=${encodeURIComponent(companyId)}&query=${encodeURIComponent(query)}`
      )
        .then((response) => response.json())
        .then((payload: { items?: SalesChannelRecord[] }) => setItems(Array.isArray(payload.items) ? payload.items : []))
        .catch(() => setItems([]));
    }, 150);

    return () => window.clearTimeout(timer);
  }, [companyId, open, query]);

  const exactMatch = useMemo(
    () => items.find((item) => item.name.trim().toLowerCase() === query.trim().toLowerCase()) ?? null,
    [items, query]
  );

  const createChannel = async () => {
    const trimmed = query.trim();
    if (!companyId || !trimmed) return;

    setBusy(true);
    try {
      const response = await fetch("/api/reference/sales-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, name: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as { item?: SalesChannelRecord; error?: string };
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? "Failed to save sales channel");
      }

      const item = payload.item;

      onChange({ id: item.id, name: item.name });
      setQuery(item.name);
      setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange({ id: "", name: next });
        }}
        placeholder="Start typing to search or create a channel"
      />
      {helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
      {open && companyId ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/40">
          {items.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ id: item.id, name: item.name });
                setQuery(item.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span>{item.name}</span>
            </button>
          ))}
          {query.trim() && !exactMatch ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={createChannel}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-slate-900 disabled:opacity-60"
            >
              {busy ? "Saving..." : `Create “${query.trim()}”`}
            </button>
          ) : null}
          {selectedId ? <p className="mt-2 px-3 text-xs text-slate-500">Selected channel is saved to the order snapshot.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
