import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/platform/moduleGate";
import { canAccessMerchant } from "@/lib/platform/permissions";
import { SWIFTEAM_METERED_ACTIONS, type SwifteamMeteredAction } from "@/lib/swifteam";

type UsageEventBody = {
  occurredAt?: string;
  merchantId?: string;
  moduleKey?: string;
  actionKey?: string;
  channel?: string;
  channelIdentity?: string;
  quantity?: number;
  durationSeconds?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

const VALID_ACTIONS = new Set<string>(SWIFTEAM_METERED_ACTIONS);

export const POST = requireModule("communicate_it", async (request: NextRequest, ctx) => {
  const body = (await request.json().catch(() => ({}))) as UsageEventBody;

  const contextMerchantId = ctx.activeContext.type === "merchant" ? ctx.activeContext.id : "";
  const merchantId = (body.merchantId ?? contextMerchantId).trim();
  if (!merchantId) {
    return NextResponse.json({ error: "merchantId is required or select a merchant context first." }, { status: 400 });
  }

  if (!canAccessMerchant(ctx.accessProfile, merchantId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const actionKey = (body.actionKey ?? "").trim() as SwifteamMeteredAction;
  if (!VALID_ACTIONS.has(actionKey)) {
    return NextResponse.json({ error: "Unsupported actionKey for Swifteam metering." }, { status: 400 });
  }

  const moduleKey = (body.moduleKey ?? "communicate_it").trim() || "communicate_it";
  const quantity = Number.isFinite(body.quantity) ? Math.max(0, Number(body.quantity)) : 1;
  const durationSeconds =
    body.durationSeconds == null
      ? null
      : Number.isFinite(body.durationSeconds)
        ? Math.max(0, Math.trunc(Number(body.durationSeconds)))
        : null;

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid occurredAt timestamp." }, { status: 400 });
  }

  const actorMode =
    ctx.activeContext.type === "merchant"
      ? "customer_context"
      : ctx.activeContext.type === "organisation"
        ? "organisation_context"
        : "platform";

  const { data, error } = await ctx.privilegedClient
    .from("usage_events")
    .insert({
      occurred_at: occurredAt.toISOString(),
      actor_user_id: ctx.userId,
      actor_email: ctx.accessProfile.email ?? "unknown",
      actor_mode: actorMode,
      merchant_id: merchantId,
      module_key: moduleKey,
      action_key: actionKey,
      channel: body.channel?.trim() || null,
      channel_identity: body.channelIdentity?.trim() || null,
      quantity,
      duration_seconds: durationSeconds,
      resource_type: body.resourceType?.trim() || null,
      resource_id: body.resourceId?.trim() || null,
      metadata: body.metadata ?? {},
    })
    .select("id, occurred_at, actor_email, actor_mode, merchant_id, action_key, channel, channel_identity, quantity, duration_seconds")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to record usage event." }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
});
