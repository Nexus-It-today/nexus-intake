import AppShell from "@/components/AppShell";
import ProcessItQueue from "@/components/ProcessItQueue";
import Link from "next/link";
import WorkflowStageBanner from "@/components/WorkflowStageBanner";

export const metadata = {
  title: "Process it - Nexus it today",
};

export default function ProcessItPage() {
  return (
    <AppShell>
      <div className="space-y-4">
        <WorkflowStageBanner
          currentStage="process"
          orderStatus="Processing and dispatch control"
          nextRequiredAction="Release collection, confirm collection, then release delivery"
        />

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
          <Link href="/review-it?status=Needs%20Review,Failed%20/%20issue,Failed%20to%20send%20to%20Track-POD" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#7C3AED]/40 hover:bg-white">
            Review Queue
          </Link>
          <Link href="/track-it" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#7C3AED]/40 hover:bg-white">
            Track-POD Queue
          </Link>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
            Dispatch Queue - Coming Soon
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
            Driver Allocation - Coming Soon
          </div>
          <Link href="/process-it?filter=error" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#7C3AED]/40 hover:bg-white">
            Exceptions
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/dashboard" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Oversee it</Link>
          <Link href="/app/create-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Create it</Link>
          <Link href="/review-it?status=Needs%20Review,Failed%20/%20issue,Failed%20to%20send%20to%20Track-POD" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Review it</Link>
          <Link href="/track-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Track it</Link>
          <Link href="/account-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">Account it</Link>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-700">Process it</span>
        </div>
        <ProcessItQueue />
      </div>
    </AppShell>
  );
}
