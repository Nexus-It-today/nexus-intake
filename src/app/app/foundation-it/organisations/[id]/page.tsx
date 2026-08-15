"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";
import MembershipsManager from "@/components/platform/MembershipsManager";
import { ORGANISATION_ROLES } from "@/lib/platform/types";
import {
  Badge,
  Card,
  ErrorState,
  FieldLabel,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Table,
  Td,
  Th,
  inputClassName,
  statusTone,
} from "@/components/platform/ui";

type OrganisationDetail = {
  organisation: {
    id: string;
    name: string;
    trading_name: string | null;
    status: "active" | "suspended" | "archived";
    merchantCount: number;
    memberCount: number;
  };
};

type MerchantsResponse = { merchants: { id: string; name: string; trading_name: string | null; status: string }[] };

export default function OrganisationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { accessToken, profile, previewReadOnly } = usePlatform();
  const { data, loading, error, reload } = useAuthedResource<OrganisationDetail>(`/api/platform/organisations/${id}`);
  const { data: merchantsData, reload: reloadMerchants } = useAuthedResource<MerchantsResponse>(
    `/api/platform/organisations/${id}/merchants`
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [showCreateMerchant, setShowCreateMerchant] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [creatingMerchant, setCreatingMerchant] = useState(false);
  const [merchantError, setMerchantError] = useState<string | null>(null);

  const canManage =
    !previewReadOnly &&
    (Boolean(profile?.isPlatformAdmin) ||
      profile?.organisations.some((org) => org.id === id && ["organisation_owner", "organisation_admin"].includes(org.role)));

  function startEdit() {
    if (!data) return;
    setName(data.organisation.name);
    setTradingName(data.organisation.trading_name ?? "");
    setEditing(true);
  }

  async function onSaveEdit() {
    setSavingEdit(true);
    setEditError(null);
    try {
      await authedFetch(accessToken, `/api/platform/organisations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, tradingName }),
      });
      setEditing(false);
      await reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update organisation.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onArchiveToggle() {
    if (!data) return;
    const nextStatus = data.organisation.status === "archived" ? "active" : "archived";
    await authedFetch(accessToken, `/api/platform/organisations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await reload();
  }

  async function onCreateMerchant() {
    if (!merchantName.trim()) {
      setMerchantError("Merchant name is required.");
      return;
    }
    setCreatingMerchant(true);
    setMerchantError(null);
    try {
      await authedFetch(accessToken, `/api/platform/organisations/${id}/merchants`, {
        method: "POST",
        body: JSON.stringify({ name: merchantName }),
      });
      setMerchantName("");
      setShowCreateMerchant(false);
      await reloadMerchants();
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : "Failed to create merchant.");
    } finally {
      setCreatingMerchant(false);
    }
  }

  if (loading) return <LoadingState label="Loading organisation..." />;
  if (error || !data) return <ErrorState description={error ?? "Organisation not found."} />;

  const { organisation } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organisation"
        title={organisation.name}
        description={organisation.trading_name ? `Trading as ${organisation.trading_name}` : undefined}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <SecondaryButton onClick={startEdit}>Edit</SecondaryButton>
              <SecondaryButton onClick={onArchiveToggle}>
                {organisation.status === "archived" ? "Restore" : "Archive"}
              </SecondaryButton>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(organisation.status)}>{organisation.status}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Merchants</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{organisation.merchantCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Members</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{organisation.memberCount}</p>
        </Card>
      </div>

      {editing ? (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Organisation name</FieldLabel>
              <input className={inputClassName} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <FieldLabel>Trading name</FieldLabel>
              <input className={inputClassName} value={tradingName} onChange={(event) => setTradingName(event.target.value)} />
            </div>
          </div>
          {editError ? <p className="mt-3 text-sm text-rose-600">{editError}</p> : null}
          <div className="mt-4 flex gap-2">
            <PrimaryButton onClick={onSaveEdit} disabled={savingEdit || previewReadOnly}>
              {savingEdit ? "Saving..." : "Save changes"}
            </PrimaryButton>
            <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Merchants</h2>
          {canManage ? (
            <PrimaryButton onClick={() => setShowCreateMerchant((prev) => !prev)}>
              {showCreateMerchant ? "Cancel" : "Create merchant"}
            </PrimaryButton>
          ) : null}
        </div>

        {showCreateMerchant ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FieldLabel>Merchant name</FieldLabel>
              <input className={inputClassName} value={merchantName} onChange={(event) => setMerchantName(event.target.value)} />
            </div>
            <PrimaryButton onClick={onCreateMerchant} disabled={creatingMerchant || previewReadOnly}>
              {creatingMerchant ? "Creating..." : "Create"}
            </PrimaryButton>
          </div>
        ) : null}
        {merchantError ? <p className="mt-2 text-sm text-rose-600">{merchantError}</p> : null}

        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(merchantsData?.merchants ?? []).map((merchant) => (
                <tr key={merchant.id}>
                  <Td className="font-medium text-slate-900">{merchant.name}</Td>
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
              {(merchantsData?.merchants ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={3} className="py-6 text-center text-slate-400">
                    No merchants yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      <MembershipsManager kind="organisation" parentId={id} roles={ORGANISATION_ROLES} canManage={Boolean(canManage)} />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Brand it</h2>
          <Link href={`/app/foundation-it/brand-it?scope=organisation&scopeId=${id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Manage organisation branding
          </Link>
        </div>
      </Card>
    </div>
  );
}
