import AppShell from "@/components/AppShell";
import Link from "next/link";

const channels = [
  {
    title: "Doorway Booking Demo",
    path: "/booking-forms/doorway",
    detail: "A public-facing Doorway demonstration using the same standard order schema.",
  },
  {
    title: "Merchant Booking Form",
    path: "/app/create-it",
    detail: "Portal booking flow for merchants using the standard order schema.",
  },
  {
    title: "Public Booking Form",
    path: "/booking-forms/public",
    detail: "Public website intake using the shared standard order object.",
  },
  {
    title: "Embedded Booking Form",
    path: "/booking-forms/embedded",
    detail: "Embed-ready intake endpoint for customer websites.",
  },
  {
    title: "Internal Order Entry",
    path: "/order-input",
    detail: "Ops, telephone, and email orders into one standard order.",
  },
  {
    title: "WooCommerce-Compatible Intake",
    path: "/booking-forms/woocommerce",
    detail: "Standard schema intake for WooCommerce-originated orders.",
  },
  {
    title: "Shopify-Compatible Intake",
    path: "/booking-forms/shopify",
    detail: "Standard schema intake for Shopify-originated orders.",
  },
];

export default function BookingFormsPage() {
  return (
    <AppShell>
      <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/40">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nexus Intake</p>
          <h1 className="text-3xl font-semibold text-slate-950">Unified Booking Channels</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Every channel below creates exactly the same standard order object before review and Track-POD.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {channels.map((channel) => (
            <Link
              key={channel.path}
              href={channel.path}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-[#7C3AED] hover:bg-white"
            >
              <p className="text-lg font-semibold text-slate-900">{channel.title}</p>
              <p className="mt-1 text-xs text-slate-500">{channel.path}</p>
              <p className="mt-3 text-sm text-slate-600">{channel.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
