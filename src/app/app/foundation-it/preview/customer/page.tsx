"use client";

import { useState } from "react";
import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { authedFetch } from "@/lib/platform/clientApi";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, PrimaryButton, Table, Td, Th, inputClassName } from "@/components/platform/ui";

type CustomerSearchRow = {
  id: string;
  company_id: string;
  customer_name: string;
  email: string | null;
  contact_name: string | null;
};

export default function PreviewCustomerSearchPage() {
  const { accessToken, profile } = usePlatform();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await authedFetch<{ customers: CustomerSearchRow[] }>(
        accessToken,
        `/api/platform/customers?search=${encodeURIComponent(query.trim())}`
      );
      setResults(payload.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  if (profile && !profile.isPlatformAdmin) {
    return <ErrorState title="Platform admins only" description="Preview as Customer is restricted to Nexus platform admins." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it - Master Admin"
        title="Preview as Customer"
        description="Read-only. Search for a customer to see their orders exactly as they would - nothing here can be edited."
      />

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <input
              className={inputClassName}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSearch()}
              placeholder="Search by customer name, email or contact"
            />
          </div>
          <PrimaryButton onClick={onSearch} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </PrimaryButton>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </Card>

      {loading ? <LoadingState label="Searching customers..." /> : null}

      {results && !loading ? (
        results.length === 0 ? (
          <EmptyState title="No customers found" description="Try a different name, email or contact." />
        ) : (
          <Card className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Contact</Th>
                  <Th>Email</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((customer) => (
                  <tr key={customer.id}>
                    <Td className="font-medium text-slate-900">{customer.customer_name}</Td>
                    <Td>{customer.contact_name ?? "-"}</Td>
                    <Td>{customer.email ?? "-"}</Td>
                    <Td>
                      <Link
                        href={`/app/foundation-it/preview/customer/${customer.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        Preview
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )
      ) : null}
    </div>
  );
}
