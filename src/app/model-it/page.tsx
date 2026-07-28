import Link from "next/link";
import { MODEL_IT_ARTIFACTS, MODEL_IT_PHASE_ONE_STARTERS } from "@/lib/modelIt";

export default function ModelItPage() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--nexus-purple)]">
          Model It
        </p>
        <h1 className="text-2xl font-semibold text-[var(--nexus-graphite)] sm:text-3xl">
          Self-service modelling platform
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
          Configure merchant-specific document templates, OCR mapping, booking forms, workflows,
          pricing and integration mappings without requiring code changes.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace model
        </h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Platform Admin</p>
            <p className="mt-1 text-xs text-slate-600">Manage all merchants and publish global templates.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Merchant Admin</p>
            <p className="mt-1 text-xs text-slate-600">Create and publish workspace models, forms and rules.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Merchant User</p>
            <p className="mt-1 text-xs text-slate-600">Use models, submit documents and suggest changes.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Configurable artifacts
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODEL_IT_ARTIFACTS.map((artifact) => (
            <article key={artifact.kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{artifact.label}</p>
              <p className="mt-1 text-xs text-slate-600">{artifact.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          Working model priority
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {MODEL_IT_PHASE_ONE_STARTERS.map((starter) => (
            <article key={starter.modelKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{starter.modelKey}</p>
              <p className="mt-1 text-xs text-slate-600">Merchant workspace: {starter.merchantKey}</p>
              <p className="mt-1 text-xs text-slate-600">Document type: {starter.documentType}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Learning focus
              </p>
              <p className="mt-1 text-xs text-slate-700">{starter.focus.join(" | ")}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">Status: Active OCR model</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-600">
          Delivery order: BLB Purchase Order model first, Doorway Delivery Note model second,
          then merchant booking forms and merchant public web forms.
        </p>
      </section>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <Link href="/portal/book-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">
          Book It
        </Link>
        <Link href="/portal/documents" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">
          Documents
        </Link>
        <Link href="/app/manage-it" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-slate-300">
          Manage It
        </Link>
      </div>
    </div>
  );
}
