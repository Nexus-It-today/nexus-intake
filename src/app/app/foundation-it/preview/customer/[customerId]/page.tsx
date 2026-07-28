"use client";

import { useParams } from "next/navigation";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Table, Td, Th } from "@/components/platform/ui";
import type { DashboardRow } from "@/lib/orders/dashboard";

type PreviewResponse = {
  customer: { id: string; name: string; email: string | null; contactName: string | null };
  orders: DashboardRow[];
};

export default function PreviewCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = typeof params.customerId === "string" ? params.customerId : "";
  const { profile } = usePlatform();
  const { data, loading, error } = useAuthedResource<PreviewResponse>(
    customerId ? `/api/platform/customers/${customerId}/preview` : null
  );

  if (profile && !profile.isPlatformAdmin) {
    return <ErrorState title="Platform admins only" description="Preview as Customer is restricted to Nexus platform admins." />;
  }

  if (loading) return <LoadingState label="Loading customer preview..." />;
  if (error || !data) return <ErrorState description={error ?? "Customer not found."} />;

  const { customer, orders } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
        Previewing as customer {customer.name} — read-only. This view uses admin-only reads; it never signs in as this customer.
      </div>

      <PageHeader
        eyebrow="Foundation it - Master Admin"
        title={customer.name}
        description={[customer.contactName, customer.email].filter(Boolean).join(" · ") || undefined}
      />

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="This customer has no orders on record." />
      ) : (
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Delivery</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <Td className="font-medium text-slate-900">{order.internalOrderNumber}</Td>
                  <Td>{order.deliveryName}</Td>
                  <Td>{order.lifecycleStatus}</Td>
                  <Td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
