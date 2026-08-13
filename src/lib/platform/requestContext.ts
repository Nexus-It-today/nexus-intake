/**
 * src/lib/platform/requestContext.ts
 *
 * getPlatformContext — the single entry point for every /api/platform/* and
 * Foundation-it Route Handler that needs a fully-resolved tenant context.
 *
 * Returns { userId, activeContext, accessProfile, privilegedClient } so
 * callers have:
 *   - the verified user identity
 *   - the active "Working as" context (platform / organisation / merchant)
 *   - the full access profile (all orgs + merchants the user can see)
 *   - a privileged Supabase client for writes (callers MUST enforce
 *     canManage* / canAccess* checks before using it)
 *
 * The active context is derived by:
 *   1. reading the nexus-active-context cookie (UX hint only)
 *   2. resolving it against the server-computed access profile
 *      (cookie value is never trusted directly)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "./accessProfile";
import { readStoredContext, resolveActiveContext } from "./context";
import { createPrivilegedClient } from "./supabaseServer";
import type { AccessProfile, ActiveContext } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformContextError = { ok: false; error: string; status: number };

export type PlatformContext = {
  ok: true;
  userId: string;
  activeContext: ActiveContext;
  accessProfile: AccessProfile;
  privilegedClient: SupabaseClient;
};

/**
 * Resolves the full platform context for a Route Handler request.
 *
 * Example usage:
 *   const ctx = await getPlatformContext(request);
 *   if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
 *   const { userId, activeContext, accessProfile, privilegedClient } = ctx;
 */
export async function getPlatformContext(
  request: NextRequest
): Promise<PlatformContext | PlatformContextError> {
  const profileResult = await getAccessProfile(request);
  if (!profileResult.ok) {
    return { ok: false, error: profileResult.error, status: profileResult.status };
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const profile = profileResult.value;
  const storedContext = readStoredContext(request);
  const activeContext = resolveActiveContext(profile, storedContext);

  return {
    ok: true,
    userId: profile.userId,
    activeContext,
    accessProfile: profile,
    privilegedClient,
  };
}

/**
 * Writes the resolved active context back to the response cookie.
 * Call this when the context may have changed (e.g. after a context switch).
 */
export function applyContextCookie(response: NextResponse, context: ActiveContext): void {
  const stored =
    context.type === "platform"
      ? { type: "platform" as const }
      : context.type === "organisation"
        ? { type: "organisation" as const, id: context.id }
        : { type: "merchant" as const, id: context.id };

  response.cookies.set("nexus-active-context", JSON.stringify(stored), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
