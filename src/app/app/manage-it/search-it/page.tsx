"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type MerchantWorkspace = {
  id: string;
  merchantName: string;
  contact: string;
  email: string;
  telephone: string;
  status: string;
};

type MerchantCustomer = {
  id: string;
  companyId: string;
  customerName: string;
  company: string;
  contactName: string;
  email: string;
};

type CustomerAddress = {
  id: string;
  addressType: string;
  label: string;
  contactName: string;
  addressLine1: string;
  postcode: string;
  customerId: string;
};

type OrderRow = {
  id: string;
  internalOrderNumber: string;
  externalOrderReference: string;
  trackpodDeliveryOrderId?: string;
  trackpodCollectionOrderId?: string;
  lifecycleStatus: string;
  customerMerchant: string;
  salesChannelName: string;
};

type BookingProfile = {
  id: string;
  profileName: string;
  instructions: string;
  customerId: string;
};

type ProductRow = {
  id: string;
  name: string;
  description: string;
  sku: string | null;
};

type SearchResult = {
  id: string;
  type: "merchant" | "customer" | "address" | "order" | "booking_form" | "product";
  title: string;
  context: string;
  actions: Array<{ label: string; href: string }>;
};

type SortKey = "type" | "title" | "context";

export default function SearchItPage() {
  return (
    <Suspense fallback={<SearchItFallback />}>
      <SearchItPageContent />
    </Suspense>
  );
}

function SearchItPageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("type");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(urlQuery);
    if (urlQuery.trim()) {
      void runSearch(urlQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const grouped = useMemo(() => {
    return {
      merchants: results.filter((row) => row.type === "merchant"),
      customers: results.filter((row) => row.type === "customer"),
      addresses: results.filter((row) => row.type === "address"),
      orders: results.filter((row) => row.type === "order"),
      forms: results.filter((row) => row.type === "booking_form"),
      products: results.filter((row) => row.type === "product"),
    };
  }, [results]);

  async function runSearch(rawQuery?: string) {
    const needle = (rawQuery ?? query).trim();
    if (!needle) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!supabase) {
        setError("Session services are not ready. Refresh the page and sign in again.");
        setResults([]);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("No active authenticated session found. Sign in once and run search again.");
        setResults([]);
        return;
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };

      const customersResponse = await fetch(
        `/api/merchant/customers?search=${encodeURIComponent(needle)}&archived=false`,
        { headers }
      );
      const customersPayload = (await customersResponse.json().catch(() => ({}))) as {
        customers?: MerchantCustomer[];
        error?: string;
      };
      if (!customersResponse.ok) {
        throw new Error(customersPayload.error ?? "Customer search failed");
      }
      const customers = customersPayload.customers ?? [];

      const [addressLists, profileLists, productsResponse] = await Promise.all([
        Promise.all(
        customers.slice(0, 40).map(async (customer) => {
          const response = await fetch(
            `/api/merchant/customers/${encodeURIComponent(customer.id)}/addresses?archived=false`,
            { headers }
          );
          if (!response.ok) return [] as CustomerAddress[];
          const payload = (await response.json().catch(() => ({}))) as {
            addresses?: CustomerAddress[];
          };
          return payload.addresses ?? [];
        })
        ),
        Promise.all(
          customers.slice(0, 40).map(async (customer) => {
            const response = await fetch(
              `/api/merchant/customers/${encodeURIComponent(customer.id)}/booking-profiles?archived=false`,
              { headers }
            );
            if (!response.ok) return [] as BookingProfile[];
            const payload = (await response.json().catch(() => ({}))) as {
              profiles?: BookingProfile[];
            };
            return payload.profiles ?? [];
          })
        ),
        fetch(`/api/catalogue/items?query=${encodeURIComponent(needle)}&item_type=product`, { headers }),
      ]);

      const productsPayload = (await productsResponse.json().catch(() => ({}))) as {
        items?: ProductRow[];
      };
      const products = productsResponse.ok ? (productsPayload.items ?? []) : [];

      const addresses = addressLists
        .flat()
        .filter((address) =>
          [
            address.label,
            address.contactName,
            address.addressLine1,
            address.postcode,
            address.addressType,
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle.toLowerCase())
        );

      const bookingProfiles = profileLists
        .flat()
        .filter((profile) =>
          [profile.profileName, profile.instructions]
            .join(" ")
            .toLowerCase()
            .includes(needle.toLowerCase())
        );

      const ordersResponse = await fetch(
        `/api/orders/dashboard?search=${encodeURIComponent(needle)}&limit=100`,
        { headers }
      );
      const ordersPayload = (await ordersResponse.json().catch(() => ({}))) as {
        jobs?: OrderRow[];
        error?: string;
      };
      if (!ordersResponse.ok) {
        throw new Error(ordersPayload.error ?? "Order search failed");
      }
      const orders = ordersPayload.jobs ?? [];

      const merchantResponse = await fetch(`/api/manage-it/merchants?search=${encodeURIComponent(needle)}&page=1&pageSize=100`, {
        headers,
      });
      const merchantPayload = (await merchantResponse.json().catch(() => ({}))) as {
        merchants?: MerchantWorkspace[];
      };
      const merchants = (merchantResponse.ok ? (merchantPayload.merchants ?? []) : []).filter((merchant) =>
        [merchant.merchantName, merchant.contact, merchant.email, merchant.telephone, merchant.status]
          .join(" ")
          .toLowerCase()
          .includes(needle.toLowerCase())
      );

      const merged: SearchResult[] = [
        ...merchants.map((merchant) => ({
          id: `merchant-${merchant.id}`,
          type: "merchant" as const,
          title: merchant.merchantName,
          context: `${merchant.contact || merchant.email || "no contact"} · ${merchant.status}`,
          actions: [
            { label: "Open Merchant", href: `/app/manage-it?merchantId=${encodeURIComponent(merchant.id)}` },
            { label: "Open Orders", href: `/orders?companyId=${encodeURIComponent(merchant.id)}` },
          ],
        })),
        ...customers.map((customer) => ({
          id: `customer-${customer.id}`,
          type: "customer" as const,
          title: customer.customerName,
          context: [customer.company, customer.contactName, customer.email].filter(Boolean).join(" · "),
          actions: [
            { label: "Open Customer", href: `/app/manage-it?merchantId=${encodeURIComponent(customer.companyId)}` },
            { label: "Create Order from Customer", href: `/app/create-it?customerId=${encodeURIComponent(customer.id)}` },
          ],
        })),
        ...addresses.map((address) => ({
          id: `address-${address.id}`,
          type: "address" as const,
          title: `${address.label || address.addressLine1} (${address.addressType})`,
          context: `${address.addressLine1} · ${address.postcode}`,
          actions: [
            { label: "Open Address", href: "/app/manage-it" },
            { label: "Create Order from Customer", href: `/app/create-it?customerId=${encodeURIComponent(address.customerId)}` },
          ],
        })),
        ...orders.map((order) => ({
          id: `order-${order.id}`,
          type: "order" as const,
          title: order.internalOrderNumber || order.id,
          context: [
            order.lifecycleStatus,
            order.customerMerchant,
            order.salesChannelName,
            order.externalOrderReference,
            order.trackpodDeliveryOrderId,
            order.trackpodCollectionOrderId,
          ]
            .filter(Boolean)
            .join(" · "),
          actions: [
            { label: "Open Order", href: `/orders?orderId=${encodeURIComponent(order.id)}` },
            { label: "Open in Process", href: `/process-it?selected=${encodeURIComponent(order.id)}` },
            { label: "Create Order from Customer", href: "/app/create-it" },
          ],
        })),
        ...bookingProfiles.map((form) => ({
          id: `profile-${form.id}`,
          type: "booking_form" as const,
          title: form.profileName,
          context: form.instructions || "Address book",
          actions: [
            { label: "Open Customer", href: "/app/manage-it" },
            { label: "Create Order from Profile", href: `/app/create-it?customerId=${encodeURIComponent(form.customerId)}&profileId=${encodeURIComponent(form.id)}` },
          ],
        })),
        ...products.map((product) => ({
          id: `product-${product.id}`,
          type: "product" as const,
          title: product.name,
          context: [product.sku, product.description].filter(Boolean).join(" · "),
          actions: [
            { label: "Open Products", href: "/portal/catalogue-it" },
            { label: "Create Order", href: "/app/create-it" },
          ],
        })),
      ];

      setResults(sortResults(merged, sortKey, sortDirection));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(nextDirection);
      setResults((prev) => sortResults(prev, key, nextDirection));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
    setResults((prev) => sortResults(prev, key, "asc"));
  }

  return (
      <div className="space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Oversee it</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Search it</h1>
          <p className="mt-1 text-sm text-slate-600">
            Search operational data in-app across merchants, customers, addresses, orders, and address books.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runSearch();
                }
              }}
              placeholder="Search by merchant, customer, address, order ref, or form"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={() => void runSearch()}
              disabled={loading}
              className="rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <SummaryTile label="Merchants" value={grouped.merchants.length} />
            <SummaryTile label="Customers" value={grouped.customers.length} />
            <SummaryTile label="Addresses" value={grouped.addresses.length} />
            <SummaryTile label="Orders" value={grouped.orders.length} />
            <SummaryTile label="Address Books" value={grouped.forms.length} />
            <SummaryTile label="Products" value={grouped.products.length} />
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  <button type="button" onClick={() => toggleSort("type")}>Type</button>
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  <button type="button" onClick={() => toggleSort("title")}>Name</button>
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  <button type="button" onClick={() => toggleSort("context")}>Context</button>
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                    {loading ? "Searching..." : "No results yet. Run a search to view merchants, customers, addresses, orders, and address books."}
                  </td>
                </tr>
              ) : (
                results.map((result) => (
                  <tr key={result.id}>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-700">
                        {result.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{result.title}</td>
                    <td className="px-3 py-2 text-slate-700">{result.context || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {result.actions.map((action) => (
                          <Link
                            key={`${result.id}-${action.label}`}
                            href={action.href}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
  );
}

function SearchItFallback() {
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Oversee it</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Search it</h1>
        <p className="mt-1 text-sm text-slate-600">Loading search workspace...</p>
      </header>
    </div>
  );
}

function sortResults(rows: SearchResult[], key: SortKey, direction: "asc" | "desc"): SearchResult[] {
  const sorted = [...rows].sort((a, b) => {
    const av = (a[key] ?? "").toString().toLowerCase();
    const bv = (b[key] ?? "").toString().toLowerCase();
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return direction === "asc" ? sorted : sorted.reverse();
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
