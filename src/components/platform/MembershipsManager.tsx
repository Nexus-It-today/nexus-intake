"use client";

import { useState } from "react";
import { usePlatform } from "./PlatformProvider";
import { authedFetch } from "@/lib/platform/clientApi";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import {
  Badge,
  Card,
  DangerButton,
  FieldLabel,
  PrimaryButton,
  Table,
  Td,
  Th,
  inputClassName,
  statusTone,
} from "./ui";

type MembershipRow = { id: string; role: string; status: string; email: string | null; user_id: string };

export default function MembershipsManager({
  kind,
  parentId,
  roles,
  canManage,
}: {
  kind: "organisation" | "merchant";
  parentId: string;
  roles: string[];
  canManage: boolean;
}) {
  const { accessToken } = usePlatform();
  const listUrl =
    kind === "organisation"
      ? `/api/platform/organisations/${parentId}/memberships`
      : `/api/platform/merchants/${parentId}/memberships`;
  const { data, loading, error, reload } = useAuthedResource<{ memberships: MembershipRow[] }>(listUrl);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1] ?? roles[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function membershipUrl(membershipId: string): string {
    return kind === "organisation"
      ? `/api/platform/organisation-memberships/${membershipId}`
      : `/api/platform/merchant-memberships/${membershipId}`;
  }

  async function onInvite() {
    if (!email.trim()) {
      setFormError("Email is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await authedFetch(accessToken, listUrl, { method: "POST", body: JSON.stringify({ email, role }) });
      setEmail("");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite member.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRoleChange(membershipId: string, newRole: string) {
    await authedFetch(accessToken, membershipUrl(membershipId), { method: "PATCH", body: JSON.stringify({ role: newRole }) });
    await reload();
  }

  async function onRemove(membershipId: string) {
    await authedFetch(accessToken, membershipUrl(membershipId), { method: "DELETE" });
    await reload();
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Members</h2>

      {canManage ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldLabel>Invite by email</FieldLabel>
            <input
              className={inputClassName}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@company.com"
            />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <select className={inputClassName} value={role} onChange={(event) => setRole(event.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <PrimaryButton onClick={onInvite} disabled={submitting}>
            {submitting ? "Inviting..." : "Invite"}
          </PrimaryButton>
        </div>
      ) : null}
      {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}

      {loading ? <p className="mt-4 text-sm text-slate-400">Loading members...</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      {data ? (
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                {canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.memberships.map((membership) => (
                <tr key={membership.id}>
                  <Td className="font-medium text-slate-900">{membership.email ?? membership.user_id}</Td>
                  <Td>
                    {canManage ? (
                      <select
                        className={inputClassName}
                        value={membership.role}
                        onChange={(event) => void onRoleChange(membership.id, event.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      membership.role.replaceAll("_", " ")
                    )}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(membership.status)}>{membership.status}</Badge>
                  </Td>
                  {canManage ? (
                    <Td>
                      <DangerButton onClick={() => void onRemove(membership.id)}>Remove</DangerButton>
                    </Td>
                  ) : null}
                </tr>
              ))}
              {data.memberships.length === 0 ? (
                <tr>
                  <Td colSpan={canManage ? 4 : 3} className="py-6 text-center text-slate-400">
                    No members yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      ) : null}
    </Card>
  );
}
