import Link from "next/link";
import { usePathname } from "next/navigation";
import PlatformBreadcrumbs from "@/components/PlatformBreadcrumbs";
import WorkspaceSelector from "@/components/WorkspaceSelector";

type HeaderProps = {
  title: string;
  subtitle: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  const pathname = usePathname() || "/";
  const overseeHref = pathname.startsWith("/portal") ? "/portal/orders" : "/orders";
  const dashboardHref = pathname.startsWith("/portal") ? "/portal/orders" : "/dashboard";

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <div className="space-y-3">
        <p className="nexus-kicker">Nexus it today</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--nexus-graphite)] sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{subtitle}</p>
        <PlatformBreadcrumbs />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <WorkspaceSelector />
        <Link
          href={overseeHref}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--nexus-graphite)] shadow-sm shadow-slate-300/30 transition hover:bg-slate-50"
        >
          Back to Oversee it
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-[var(--nexus-graphite)] shadow-sm shadow-slate-300/30">
          <span className="font-semibold">Live</span> • updated 2m ago
        </div>
        <Link href="/app/manage-it/search-it?q=issue" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm shadow-slate-300/30 hover:bg-slate-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5" />
            <path d="M10 17a2 2 0 104 0" />
          </svg>
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--nexus-purple)] text-[11px] font-semibold text-white">
            !
          </span>
        </Link>
        <Link href={dashboardHref} className="rounded-2xl bg-[var(--nexus-purple)] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[rgba(139,92,246,0.35)] hover:bg-violet-700">
          Live view
        </Link>
      </div>
    </div>
  );
}
