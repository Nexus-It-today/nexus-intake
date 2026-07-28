import type { ReactNode } from "react";

/**
 * Small, reusable design-system primitives for the Sprint 1 "Foundation it"
 * application shell (/app/*). Deliberately independent of the legacy
 * AppShell/Sidebar/Header components (which carry the purple-accented
 * "verb-it" visual language) so this new surface can follow the calm,
 * navy/white "Visual direction" from day one without destabilising existing
 * operational screens.
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] ${className}`}>
      {children}
    </div>
  );
}

const badgeToneClasses: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-blue-50 text-blue-700",
  accentViolet: "bg-violet-50 text-violet-700",
  accentPink: "bg-pink-50 text-pink-700",
  accentOrange: "bg-orange-50 text-orange-700",
  accentCyan: "bg-cyan-50 text-cyan-700",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof badgeToneClasses }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeToneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof badgeToneClasses {
  if (status === "active") return "success";
  if (status === "suspended" || status === "invited") return "warning";
  if (status === "archived") return "neutral";
  return "neutral";
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-6 text-sm text-rose-700">
      <p className="font-semibold">{title}</p>
      {description ? <p className="text-rose-600">{description}</p> : null}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{children}</label>;
}

export const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-full divide-y divide-slate-200 text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{children}</th>;
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`whitespace-nowrap px-4 py-3 text-slate-700 ${className}`}>
      {children}
    </td>
  );
}
