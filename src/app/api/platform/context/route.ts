import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { NEXUS_CONTEXT_COOKIE, readStoredContext, resolveActiveContext, writeContextCookie } from "@/lib/platform/context";
import { recordAuditEvent } from "@/lib/platform/audit";
import type { StoredContextRequest } from "@/lib/platform/types";

export async function GET(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const stored = readStoredContext(request);
  const activeContext = resolveActiveContext(result.value, stored);

  return NextResponse.json({ profile: result.value, activeContext });
}

export async function POST(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = (await request.json().catch(() => ({}))) as { type?: string; id?: string };
  const requested: StoredContextRequest | null =
    body.type === "organisation" || body.type === "merchant"
      ? { type: body.type, id: String(body.id ?? "") }
      : body.type === "platform"
        ? { type: "platform" }
        : null;

  // resolveActiveContext ignores anything not present in the server-verified
  // profile, so a forged organisationId/merchantId (or a "platform" request
  // from a non-platform-admin) in the request body can never grant access to
  // a tenant/scope the caller is not actually entitled to.
  const activeContext = resolveActiveContext(result.value, requested);

  const response = NextResponse.json({ activeContext });

  if (activeContext.type === "platform") {
    // Explicit platform selection is remembered (not just "no cookie"),
    // otherwise the very next request would fall through to the default
    // organisation/merchant fallback and silently undo the switch.
    writeContextCookie(response, { type: "platform" });
  } else {
    writeContextCookie(response, { type: activeContext.type, id: activeContext.id });
  }

  const privilegedClient = createPrivilegedClient();
  if (privilegedClient) {
    await recordAuditEvent(privilegedClient, {
      actorUserId: result.value.userId,
      organisationId: activeContext.type === "organisation" ? activeContext.id : activeContext.type === "merchant" ? activeContext.organisationId : null,
      merchantId: activeContext.type === "merchant" ? activeContext.id : null,
      action: "context.switched",
      entityType: activeContext.type,
      entityId: activeContext.type === "platform" ? null : activeContext.id,
      source: "app",
    });
  }

  return response;
}

export async function DELETE(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(NEXUS_CONTEXT_COOKIE);
  return response;
}
