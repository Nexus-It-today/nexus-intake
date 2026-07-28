import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { canAccessMerchant, canAccessOrganisation } from "@/lib/platform/permissions";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const organisationId = request.nextUrl.searchParams.get("organisationId");
  const merchantId = request.nextUrl.searchParams.get("merchantId");
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  if (!result.value.isPlatformAdmin && !organisationId && !merchantId) {
    return NextResponse.json({ error: "organisationId or merchantId is required." }, { status: 400 });
  }
  if (organisationId && !canAccessOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });
  }
  if (merchantId && !canAccessMerchant(result.value, merchantId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let query = privilegedClient
    .from("audit_events")
    .select("id, actor_user_id, organisation_id, merchant_id, action, entity_type, entity_id, metadata, source, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (organisationId) query = query.eq("organisation_id", organisationId);
  if (merchantId) query = query.eq("merchant_id", merchantId);

  const { data: events, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorIds = Array.from(new Set((events ?? []).map((event) => event.actor_user_id).filter((id): id is string => Boolean(id))));
  let emailByActorId = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: userList } = await privilegedClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    emailByActorId = new Map((userList?.users ?? []).map((user) => [user.id, user.email ?? null]));
  }

  const enriched = (events ?? []).map((event) => ({
    ...event,
    actorEmail: event.actor_user_id ? emailByActorId.get(event.actor_user_id) ?? null : null,
  }));

  return NextResponse.json({ events: enriched });
}
