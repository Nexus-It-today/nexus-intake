"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";
import MembershipsManager from "@/components/platform/MembershipsManager";
import { MERCHANT_ROLES } from "@/lib/platform/types";
import {
  Badge,
  Card,
  ErrorState,
  FieldLabel,
  LoadingState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  inputClassName,
  statusTone,
} from "@/components/platform/ui";

type MerchantDetail = {
  merchant: {
    id: string;
    company_id: string;
    name: string;
    trading_name: string | null;
    status: "active" | "suspended" | "archived";
    memberCount: number;
  };
};

export default function MerchantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { accessToken, profile, previewReadOnly } = usePlatform();
  const { data, loading, error, reload } = useAuthedResource<MerchantDetail>(`/api/platform/merchants/${id}`);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canManage =
    !previewReadOnly &&
    (Boolean(profile?.isPlatformAdmin) ||
      profile?.merchants.some((m) => m.id === id && ["merchant_owner", "merchant_admin"].includes(m.role)) ||
      profile?.organisations.some(
        (org) => org.id === data?.merchant.company_id && ["organisation_owner", "organisation_admin"].includes(org.role)
      ));

  function startEdit() {
    if (!data) return;
    setName(data.merchant.name);
    setTradingName(data.merchant.trading_name ?? "");
    setEditing(true);
  }

  async function onSaveEdit() {
    setSavingEdit(true);
    setEditError(null);
    try {
      await authedFetch(accessToken, `/api/platform/merchants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, tradingName }),
      });
      setEditing(false);
      await reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update merchant.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onArchiveToggle() {
    if (!data) return;
    const nextStatus = data.merchant.status === "archived" ? "active" : "archived";
    await authedFetch(accessToken, `/api/platform/merchants/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await reload();
  }

  if (loading) return <LoadingState label="Loading merchant..." />;
  if (error || !data) return <ErrorState description={error ?? "Merchant not found."} />;

  const { merchant } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchant"
        title={merchant.name}
        description={merchant.trading_name ? `Trading as ${merchant.trading_name}` : undefined}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <SecondaryButton onClick={startEdit}>Edit</SecondaryButton>
              <SecondaryButton onClick={onArchiveToggle}>
                {merchant.status === "archived" ? "Restore" : "Archive"}
              </SecondaryButton>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(merchant.status)}>{merchant.status}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Members</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{merchant.memberCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Organisation</p>
          <Link
            href={`/app/foundation-it/organisations/${merchant.company_id}`}
            className="mt-2 block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View parent organisation
          </Link>
        </Card>
      </div>

      {editing ? (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Merchant name</FieldLabel>
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

      <MembershipsManager kind="merchant" parentId={id} roles={MERCHANT_ROLES} canManage={Boolean(canManage)} />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Brand it</h2>
          <Link
            href={`/app/foundation-it/brand-it?scope=merchant&scopeId=${id}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Manage merchant branding
          </Link>
        </div>
      </Card>
    </div>
  );
}
