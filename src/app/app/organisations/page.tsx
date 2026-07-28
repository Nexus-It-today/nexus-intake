"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";
import { Badge, Card, ErrorState, FieldLabel, LoadingState, PageHeader, PrimaryButton, SecondaryButton, Table, Td, Th, inputClassName, statusTone } from "@/components/platform/ui";
import type { OrganisationSummary } from "@/lib/platform/types";

type OrganisationsResponse = { organisations: OrganisationSummary[] };

export default function OrganisationsPage() {
  const { accessToken, profile, refresh } = usePlatform();
  const { data, loading, error, reload } = useAuthedResource<OrganisationsResponse>("/api/platform/organisations");

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canCreate = Boolean(profile?.isPlatformAdmin);

  async function onCreate() {
    if (!name.trim()) {
      setFormError("Organisation name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await authedFetch(accessToken, "/api/platform/organisations", {
        method: "POST",
        body: JSON.stringify({ name, tradingName, ownerEmail: ownerEmail || undefined }),
      });
      setName("");
      setTradingName("");
      setOwnerEmail("");
      setShowCreate(false);
      await reload();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create organisation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation it"
        title="Organisations"
        description="Every customer organisation is a tenant of Nexus it - never hard-coded, always created here."
        actions={
          canCreate ? (
            <PrimaryButton onClick={() => setShowCreate((prev) => !prev)}>{showCreate ? "Cancel" : "Create organisation"}</PrimaryButton>
          ) : null
        }
      />

      {showCreate ? (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Organisation name</FieldLabel>
              <input className={inputClassName} value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Logistics Ltd" />
            </div>
            <div>
              <FieldLabel>Trading name (optional)</FieldLabel>
              <input className={inputClassName} value={tradingName} onChange={(event) => setTradingName(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Invite an organisation owner (optional)</FieldLabel>
              <input
                className={inputClassName}
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="owner@customer.com"
              />
            </div>
          </div>
          {formError ? <p className="mt-3 text-sm text-rose-600">{formError}</p> : null}
          <div className="mt-4 flex gap-2">
            <PrimaryButton onClick={onCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create organisation"}
            </PrimaryButton>
            <SecondaryButton onClick={() => setShowCreate(false)}>Cancel</SecondaryButton>
          </div>
        </Card>
      ) : null}

      {loading ? <LoadingState label="Loading organisations..." /> : null}
      {error ? <ErrorState description={error} /> : null}

      {data ? (
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
              {data.organisations.map((org) => (
                <tr key={org.id}>
                  <Td className="font-medium text-slate-900">{org.name}</Td>
                  <Td>{org.role.replaceAll("_", " ")}</Td>
                  <Td>
                    <Badge tone={statusTone(org.status)}>{org.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/app/organisations/${org.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                      View
                    </Link>
                  </Td>
                </tr>
              ))}
              {data.organisations.length === 0 ? (
                <tr>
                  <Td className="py-8 text-center text-slate-400" colSpan={4}>
                    No organisations yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
