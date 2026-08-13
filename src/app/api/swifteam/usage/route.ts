import { NextRequest, NextResponse } from "next/server";
import { getPlatformContext } from "@/lib/platform/requestContext";
import { canAccessMerchant } from "@/lib/platform/permissions";
import { clampPercent, warningLevel } from "@/lib/swifteam";

type UsagePlanRow = {
  id: string;
  merchant_id: string;
  plan_key: string;
  period_start: string;
  period_end: string;
  email_allowance: number;
  call_minutes_allowance: number;
};

type UsageEventRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string;
  actor_email: string;
  actor_mode: string;
  merchant_id: string;
  module_key: string;
  action_key: string;
  channel: string | null;
  channel_identity: string | null;
  quantity: number;
  duration_seconds: number | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
};

function startOfMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function endOfMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const ctx = await getPlatformContext(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const requestedMerchantId = (request.nextUrl.searchParams.get("merchantId") ?? "").trim();
  const contextMerchantId = ctx.activeContext.type === "merchant" ? ctx.activeContext.id : "";
  const merchantId = requestedMerchantId || contextMerchantId;
  const includeAll = request.nextUrl.searchParams.get("scope") === "all";

  if (!merchantId && !includeAll) {
    return NextResponse.json({ error: "Switch into a merchant context to view usage." }, { status: 400 });
  }

  if (merchantId && !canAccessMerchant(ctx.accessProfile, merchantId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [{ data: merchant }, { data: planRows, error: planError }] = await Promise.all([
    merchantId
      ? ctx.privilegedClient
          .from("merchants")
          .select("id, name")
          .eq("id", merchantId)
          .maybeSingle<{ id: string; name: string }>()
      : Promise.resolve({ data: null, error: null }),
    merchantId
      ? ctx.privilegedClient
          .from("merchant_usage_plans")
          .select("id, merchant_id, plan_key, period_start, period_end, email_allowance, call_minutes_allowance")
          .eq("merchant_id", merchantId)
          .lte("period_start", monthStart)
          .gte("period_end", monthEnd)
          .order("period_start", { ascending: false })
          .limit(1)
          .returns<UsagePlanRow[]>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  const plan = planRows?.[0] ?? null;
  const periodStart = plan?.period_start ?? monthStart;
  const periodEnd = plan?.period_end ?? monthEnd;

  const { data: eventRows, error: eventsError } = merchantId
    ? await ctx.privilegedClient
        .from("usage_events")
        .select(
          "id, occurred_at, actor_user_id, actor_email, actor_mode, merchant_id, module_key, action_key, channel, channel_identity, quantity, duration_seconds, resource_type, resource_id, metadata"
        )
        .eq("merchant_id", merchantId)
        .gte("occurred_at", `${periodStart}T00:00:00.000Z`)
        .lte("occurred_at", `${periodEnd}T23:59:59.999Z`)
        .order("occurred_at", { ascending: false })
        .limit(500)
        .returns<UsageEventRow[]>()
    : { data: [], error: null };

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const rows = eventRows ?? [];
  const emailUsed = rows
    .filter((row) => row.action_key === "email_sent" || row.action_key === "email_received")
    .reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

  const callSecondsUsed = rows
    .filter((row) => row.action_key === "call_seconds" || row.action_key === "call_made" || row.action_key === "call_received")
    .reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);

  const callMinutesUsed = callSecondsUsed / 60;

  const emailAllowance = plan?.email_allowance ?? 0;
  const callMinutesAllowance = plan?.call_minutes_allowance ?? 0;

  const emailPercent = emailAllowance > 0 ? clampPercent((emailUsed / emailAllowance) * 100) : 0;
  const callPercent = callMinutesAllowance > 0 ? clampPercent((callMinutesUsed / callMinutesAllowance) * 100) : 0;

  const allLedger = includeAll && ctx.accessProfile.isPlatformAdmin
    ? await ctx.privilegedClient
        .from("usage_events")
        .select("id, occurred_at, actor_email, actor_mode, merchant_id, module_key, action_key, channel, channel_identity, quantity, duration_seconds")
        .order("occurred_at", { ascending: false })
        .limit(200)
    : { data: null, error: null };

  if (allLedger.error) {
    return NextResponse.json({ error: allLedger.error.message }, { status: 500 });
  }

  let allMerchantNames: Record<string, string> = {};
  if (allLedger.data && allLedger.data.length > 0) {
    const merchantIds = Array.from(new Set(allLedger.data.map((row) => row.merchant_id).filter(Boolean)));
    if (merchantIds.length > 0) {
      const { data: merchants } = await ctx.privilegedClient
        .from("merchants")
        .select("id, name")
        .in("id", merchantIds)
        .returns<Array<{ id: string; name: string }>>();
      allMerchantNames = Object.fromEntries((merchants ?? []).map((item) => [item.id, item.name]));
    }
  }

  return NextResponse.json({
    merchant: merchant ?? null,
    plan: plan
      ? {
          planKey: plan.plan_key,
          periodStart: plan.period_start,
          periodEnd: plan.period_end,
          emailAllowance: plan.email_allowance,
          callMinutesAllowance: plan.call_minutes_allowance,
        }
      : null,
    usage: {
      email: {
        used: emailUsed,
        remaining: Math.max(0, emailAllowance - emailUsed),
        percentageUsed: Number(emailPercent.toFixed(2)),
        warning: warningLevel(emailPercent),
      },
      calls: {
        usedMinutes: Number(callMinutesUsed.toFixed(2)),
        remainingMinutes: Math.max(0, Number((callMinutesAllowance - callMinutesUsed).toFixed(2))),
        percentageUsed: Number(callPercent.toFixed(2)),
        warning: warningLevel(callPercent),
      },
    },
    selectedMerchantLedger: rows,
    allMerchantsLedger:
      allLedger.data?.map((row) => ({
        ...row,
        merchantName: allMerchantNames[row.merchant_id] ?? row.merchant_id,
      })) ?? [],
  });
}
