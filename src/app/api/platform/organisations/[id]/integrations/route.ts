import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import { canAccessOrganisation, canManageOrganisation } from "@/lib/platform/permissions";
import {
  disconnectOrganisationConnection,
  fetchIntegrationProviders,
  fetchOrganisationConnections,
  upsertOrganisationConnection,
} from "@/lib/platform/integrations";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canAccessOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const [providers, connections] = await Promise.all([
    fetchIntegrationProviders(privilegedClient),
    fetchOrganisationConnections(privilegedClient, organisationId),
  ]);

  const connectionByProvider = new Map(connections.map((connection) => [connection.provider_key, connection]));
  const merged = providers.map((provider) => ({
    ...provider,
    connection: connectionByProvider.get(provider.provider_key) ?? null,
  }));

  return NextResponse.json({ integrations: merged, canManage: canManageOrganisation(result.value, organisationId) });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canManageOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have permission to configure integrations for this organisation." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { providerKey?: string; credentials?: Record<string, unknown> };
  const providerKey = body.providerKey?.trim();
  if (!providerKey) {
    return NextResponse.json({ error: "providerKey is required." }, { status: 400 });
  }
  if (!body.credentials || typeof body.credentials !== "object" || Array.isArray(body.credentials)) {
    return NextResponse.json({ error: "credentials must be an object." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const upsertResult = await upsertOrganisationConnection(privilegedClient, {
    organisationId,
    providerKey,
    credentials: body.credentials,
    actorUserId: result.value.userId,
  });

  if (!upsertResult.ok) {
    return NextResponse.json({ error: upsertResult.error }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    action: "integration.connected",
    entityType: "organisation_integration_connection",
    entityId: upsertResult.row.id,
    metadata: { providerKey, credentialHint: upsertResult.row.credential_hint },
  });

  // Never echo back the credentials the caller just sent, even though we
  // already have them in memory - the response only ever carries the safe
  // (no-secret) row shape.
  return NextResponse.json({ connection: upsertResult.row }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: organisationId } = await params;
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!canManageOrganisation(result.value, organisationId)) {
    return NextResponse.json({ error: "You do not have permission to configure integrations for this organisation." }, { status: 403 });
  }

  const providerKey = request.nextUrl.searchParams.get("providerKey");
  if (!providerKey) {
    return NextResponse.json({ error: "providerKey query parameter is required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const disconnectResult = await disconnectOrganisationConnection(privilegedClient, organisationId, providerKey);
  if (!disconnectResult.ok) {
    return NextResponse.json({ error: disconnectResult.error }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId,
    action: "integration.disconnected",
    entityType: "organisation_integration_connection",
    entityId: providerKey,
    metadata: { providerKey },
  });

  return NextResponse.json({ ok: true });
}
