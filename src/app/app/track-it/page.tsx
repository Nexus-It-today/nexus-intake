"use client";

import { useState } from "react";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, inputClassName } from "@/components/platform/ui";
import { useAuthedResource } from "@/lib/platform/clientHooks";

type TrackOrder = {
  id: string;
  reference: string;
  customer: string;
  lifecycleStatus: string;
  status: string;
  routeStatus: string;
  requestedCollectionDate: string | null;
  requestedDeliveryDate: string | null;
  trackingLinks: {
    collection: string | null;
    delivery: string | null;
  };
  exception: string | null;
};

type OrdersResponse = {
  orders: TrackOrder[];
};

export default function SwifteamTrackItPage() {
  const { activeContext } = usePlatform();
  const [search, setSearch] = useState("");
  const merchantMode = activeContext?.type === "merchant";

  const url = merchantMode
    ? `/api/swifteam/orders?limit=80${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`
    : null;
  const { data } = useAuthedResource<OrdersResponse>(url);

  if (!merchantMode) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Swifteam V1"
          title="Track it."
          description="Track-POD/order visibility in the selected merchant context."
        />
        <EmptyState title="Select a merchant context first" description="Switch to a merchant in the header to view Track-POD and order status." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Swifteam V1"
        title="Track it."
        description="Existing Track-POD/order information for the selected merchant, with direct tracking links where available."
      />

      <Card>
        <input
          className={inputClassName}
          placeholder="Search by order reference or customer"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Card>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Status</Th>
              <Th>Track-POD</Th>
              <Th>Exception</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.orders ?? []).map((order) => (
              <tr key={order.id}>
                <Td>
                  <p className="font-medium text-slate-900">{order.reference}</p>
                  <p className="text-xs text-slate-500">{order.customer}</p>
                </Td>
                <Td>
                  <p>{order.lifecycleStatus}</p>
                  <p className="text-xs text-slate-500">{order.status}</p>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1 text-xs">
                    {order.trackingLinks.collection ? <a className="text-blue-600 hover:text-blue-700" href={order.trackingLinks.collection} target="_blank" rel="noreferrer">Collection</a> : <span className="text-slate-400">Collection —</span>}
                    {order.trackingLinks.delivery ? <a className="text-blue-600 hover:text-blue-700" href={order.trackingLinks.delivery} target="_blank" rel="noreferrer">Delivery</a> : <span className="text-slate-400">Delivery —</span>}
                  </div>
                </Td>
                <Td>{order.exception ? <Badge tone="warning">{order.exception}</Badge> : <span className="text-slate-400">None</span>}</Td>
              </tr>
            ))}
            {(data?.orders ?? []).length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-center text-slate-400">No orders found for this merchant context.</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
