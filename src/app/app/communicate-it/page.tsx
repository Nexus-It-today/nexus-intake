"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { Badge, Card, EmptyState, FieldLabel, PageHeader, PrimaryButton, inputClassName } from "@/components/platform/ui";
import { useAuthedResource } from "@/lib/platform/clientHooks";
import { authedFetch } from "@/lib/platform/clientApi";

type IdentitiesResponse = {
  primary: {
    email: string;
    phone: string;
    whatsapp: string | null;
    whatsappPlaceholder: boolean;
  };
};

type UsageLedgerRow = {
  id: string;
  occurred_at: string;
  actor_email: string;
  action_key: string;
  merchant_id: string;
  channel: string | null;
  duration_seconds: number | null;
};

type UsageResponse = {
  selectedMerchantLedger: UsageLedgerRow[];
};

export default function SwifteamCommunicatePage() {
  const { accessToken, activeContext } = usePlatform();
  const [actionKey, setActionKey] = useState("email_sent");
  const [quantity, setQuantity] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const merchantMode = activeContext?.type === "merchant";
  const merchantId = merchantMode ? activeContext.id : null;

  const identitiesUrl = merchantId ? "/api/swifteam/identities" : null;
  const usageUrl = merchantId ? "/api/swifteam/usage" : null;

  const { data: identities, reload: reloadIdentities } = useAuthedResource<IdentitiesResponse>(identitiesUrl);
  const { data: usage, reload: reloadUsage } = useAuthedResource<UsageResponse>(usageUrl);

  const channel = useMemo(() => {
    if (actionKey.startsWith("email")) return "email";
    if (actionKey.startsWith("call")) return "phone";
    return "system";
  }, [actionKey]);

  async function recordEvent(event: FormEvent) {
    event.preventDefault();
    if (!merchantId) return;

    setSaving(true);
    setFeedback(null);
    try {
      await authedFetch(accessToken, "/api/swifteam/usage-events", {
        method: "POST",
        body: JSON.stringify({
          merchantId,
          moduleKey: actionKey.startsWith("account") ? "review_it" : actionKey.startsWith("tracking") ? "track_it" : "communicate_it",
          actionKey,
          channel,
          channelIdentity:
            channel === "email"
              ? identities?.primary.email
              : channel === "phone"
                ? identities?.primary.phone
                : null,
          quantity: Number(quantity) || 1,
          durationSeconds: actionKey.startsWith("call") ? Number(durationSeconds) || 0 : null,
          metadata: notes.trim() ? { notes: notes.trim() } : {},
        }),
      });
      setFeedback("Metered event recorded.");
      setNotes("");
      await Promise.all([reloadIdentities(), reloadUsage()]);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to record event.");
    } finally {
      setSaving(false);
    }
  }

  if (!merchantMode) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Swifteam V1" title="Communicate it." description="Email/call identities and event metering in merchant context." />
        <EmptyState title="Select a merchant context first" description="Switch to a merchant in the header to attribute communication usage correctly." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Swifteam V1" title="Communicate it." description="Use Swifteam communication identities and meter each customer-context interaction." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">Email identity</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{identities?.primary.email ?? "swift@nexus.delivery"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">CircleLoop identity</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{identities?.primary.phone ?? "0113 479 0208"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">WhatsApp</p>
          <p className="mt-2 text-sm text-slate-600">Placeholder only for V1.</p>
        </Card>
      </div>

      <Card>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={recordEvent}>
          <div>
            <FieldLabel>Metered action</FieldLabel>
            <select className={inputClassName} value={actionKey} onChange={(event) => setActionKey(event.target.value)}>
              <option value="email_sent">email_sent</option>
              <option value="email_received">email_received</option>
              <option value="call_made">call_made</option>
              <option value="call_received">call_received</option>
              <option value="call_seconds">call_seconds</option>
              <option value="tracking_query">tracking_query</option>
              <option value="account_query">account_query</option>
            </select>
          </div>
          <div>
            <FieldLabel>Quantity</FieldLabel>
            <input className={inputClassName} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div>
            <FieldLabel>Duration seconds (calls)</FieldLabel>
            <input className={inputClassName} value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} />
          </div>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <input className={inputClassName} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note" />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <PrimaryButton type="submit" disabled={saving}>{saving ? "Recording..." : "Record metered event"}</PrimaryButton>
            {feedback ? <Badge tone="info">{feedback}</Badge> : null}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Recent usage events (selected merchant)</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          {(usage?.selectedMerchantLedger ?? []).slice(0, 8).map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-4">
              <span>{event.action_key} · {event.channel ?? "system"}</span>
              <span className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()}</span>
            </li>
          ))}
          {(usage?.selectedMerchantLedger ?? []).length === 0 ? <li className="text-slate-400">No events recorded yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
