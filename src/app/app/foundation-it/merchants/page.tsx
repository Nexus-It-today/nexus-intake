"use client";

import Link from "next/link";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, LoadingState, PageHeader, Table, Td, Th, statusTone } from "@/components/platform/ui";

export default function MerchantsPage() {
  const { loading, profile } = usePlatform();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Merchants"
        description="Merchants always belong to an organisation. Create new merchants from within an organisation's page."
      />

      {loading || !profile ? (
        <LoadingState label="Loading merchants..." />
      ) : profile.merchants.length === 0 ? (
        <EmptyState
          title="No merchants yet"
          description="Open an organisation and use Create merchant to add the first one."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Your role</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.merchants.map((merchant) => (
                <tr key={merchant.id}>
                  <Td className="font-medium text-slate-900">{merchant.name}</Td>
                  <Td>{merchant.role.replaceAll("_", " ")}</Td>
                  <Td>
                    <Badge tone={statusTone(merchant.status)}>{merchant.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/app/foundation-it/merchants/${merchant.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                      View
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
