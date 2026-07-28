"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StandardOrderForm from "@/components/StandardOrderForm";
import WorkflowStageBanner from "@/components/WorkflowStageBanner";

const workspaceCards = [
  { title: "Book it", href: "/app/create-it#new-order", detail: "Manual booking, quick booking, templates and API-driven intake." },
  { title: "Upload it", href: "/app/create-it", detail: "Document uploads routed through Create it intake workflow." },
  { title: "Send it", href: "/app/create-it", detail: "Email and channel intake orchestration inside Create it." },
  { title: "Get it", href: "/app/create-it", detail: "Inbound and return intake managed inside Create it." },
  { title: "Public Forms", href: "/booking-forms/public", detail: "Customer-facing intake forms connected to Create it." },
  { title: "Review Queue", href: "/process-it", detail: "Move new orders into Process it with release controls." },
  { title: "Order History", href: "/portal/orders", detail: "Review live and historical bookings." },
];

const bookingTypes = [
  {
    key: "deliver",
    title: "Deliver it",
    descriptor: "Book a standard delivery",
    detail: "Collection is locked to the merchant depot profile and delivery details are entered manually.",
  },
  {
    key: "return",
    title: "Return it",
    descriptor: "Book a customer return",
    detail: "Delivery is locked to the merchant depot profile and the pickup address is entered manually.",
  },
  {
    key: "request",
    title: "Request it",
    descriptor: "Book anything unusual",
    detail: "Manual form for exceptions, special instructions, supplier collections, and one-off jobs.",
  },
] as const;

export default function MerchantCreateItWorkspace() {
  const [bookingVariant, setBookingVariant] = useState<(typeof bookingTypes)[number]["key"]>("deliver");

  const selected = useMemo(
    () => bookingTypes.find((type) => type.key === bookingVariant) ?? bookingTypes[0],
    [bookingVariant]
  );

  return (
    <section className="space-y-8">
      <WorkflowStageBanner
        currentStage="create"
        orderStatus="Order intake in progress"
        nextRequiredAction="Submit order and hand off to Review it queue"
      />

      <header className="space-y-3 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/40">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Create-it</p>
        <h1 className="text-3xl font-semibold text-slate-950">Merchant Operational Workspace</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Create-it is the operational intake stage. Select customer, load saved address book defaults, then enter only order-specific
          fields before moving the order into Review it and Process it.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaceCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30 transition hover:-translate-y-0.5 hover:border-[#7C3AED]/40"
          >
            <p className="text-lg font-semibold text-slate-900">{card.title}</p>
            <p className="mt-2 text-sm text-slate-600">{card.detail}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/40" id="new-order">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">New Order</p>
          <h2 className="text-2xl font-semibold text-slate-950">Choose a booking type</h2>
          <p className="text-sm text-slate-600">All three forms use the same intake service and create the same operational order object.</p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {bookingTypes.map((type) => (
            <button
              key={type.key}
              type="button"
              onClick={() => setBookingVariant(type.key)}
              className={`rounded-2xl border p-4 text-left transition ${
                bookingVariant === type.key
                  ? "border-[#7C3AED] bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{type.descriptor}</p>
              <h3 className="mt-2 text-xl font-semibold">{type.title}</h3>
              <p className="mt-2 text-sm opacity-90">{type.detail}</p>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {selected.title}: {selected.detail}
        </div>
      </div>

      <StandardOrderForm
        sourceSystem="merchant_portal"
        title={selected.title}
        subtitle={selected.detail}
        bookingVariant={selected.key}
      />
    </section>
  );
}
