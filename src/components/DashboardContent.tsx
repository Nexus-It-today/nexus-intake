import Link from 'next/link';
import CommunicationsComingSoon from '@/components/CommunicationsComingSoon';
import OverseeSummaryPanel from '@/components/OverseeSummaryPanel';
import OrdersStatusBoard from '@/components/OrdersStatusBoard';
import WorkflowStageBanner from '@/components/WorkflowStageBanner';

const managementCards = [
  {
    title: 'Organisations',
    detail: 'Search, create, edit, archive, and open organisations from one operational home.',
    actions: [
      { label: 'Search organisations', href: '/app/manage-it?section=companies' },
      { label: 'Create organisation', href: '/app/manage-it?section=companies' },
      { label: 'Edit or archive', href: '/app/manage-it?section=companies' },
      { label: 'Open organisation', href: '/app/manage-it?section=companies' },
    ],
    bullets: ['Orders', 'Operational metrics', 'Users', 'Connected systems', 'Accounting integrations', 'Future integrations'],
  },
  {
    title: 'Merchants',
    detail: 'Open the same merchant workspace the merchant sees for support, ops, and data maintenance.',
    actions: [
      { label: 'Search merchants', href: '/merchants' },
      { label: 'Add merchant', href: '/merchants' },
      { label: 'Edit or archive', href: '/merchants' },
      { label: 'View merchant', href: '/app/manage-it' },
    ],
    bullets: ['Customer records', 'Address books', 'Documents', 'Operational history'],
  },
  {
    title: 'Orders / Oversee it',
    detail: 'Today-first operations with Track-POD style date windows, filters, and paging.',
    actions: [
      { label: "Today's orders", href: '/orders' },
      { label: 'Last 7 days', href: '/orders?window=last7' },
      { label: 'Last 30 days', href: '/orders?window=last30' },
      { label: 'Open Oversee it', href: '/orders' },
    ],
    bullets: ['Date filters', 'Merchant filters', 'Customer filters', 'Track-POD links'],
  },
  {
    title: 'Systems / Integrations',
    detail: 'Management placeholders for organisation integrations and future module switches.',
    actions: [
      { label: 'Manage integrations', href: '/integrate-it' },
      { label: 'Accounting view', href: '/integrate-it' },
      { label: 'Environment settings', href: '/settings' },
    ],
    bullets: ['Xero', 'QuickFile', 'Track-POD', 'WooCommerce', 'Airtable', 'Stripe', 'Resend'],
  },
];

export default function DashboardContent() {
  return (
    <div className="space-y-6">
      <WorkflowStageBanner
        currentStage="review"
        orderStatus="Operational oversight across all stages"
        nextRequiredAction="Resolve queue blockers and progress orders to Process it"
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Operational Management</p>
          <h2 className="text-2xl font-semibold text-slate-950">Super Admin Oversee it</h2>
          <p className="text-sm text-slate-600">Manage organisations, merchants, orders, and integrations from one usable dashboard.</p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {managementCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-lg font-semibold text-slate-900">{card.title}</p>
              <p className="mt-1 text-sm text-slate-600">{card.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {card.actions.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#7C3AED]/40 hover:text-[#7C3AED]"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {card.bullets.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Integration Placeholders</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {['Xero', 'QuickFile', 'Track-POD', 'WooCommerce', 'Airtable', 'Stripe', 'Resend'].map((provider) => (
            <div key={provider} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-600">
              {provider} · Coming Soon
            </div>
          ))}
        </div>
      </section>

      <OverseeSummaryPanel scope="admin" />

      <OrdersStatusBoard
        scope="admin"
        title="Today's Orders"
        subtitle="Today-first operational board with Track-POD style date windows, focused filters, and pagination."
      />

      <CommunicationsComingSoon subtitle="Placeholders for customer, merchant, and staff communication tools." />
    </div>
  );
}
