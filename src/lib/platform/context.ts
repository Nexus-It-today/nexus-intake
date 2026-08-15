import { NextRequest, NextResponse } from "next/server";
import type { AccessProfile, ActiveContext, StoredContextRequest } from "./types";

export const NEXUS_CONTEXT_COOKIE = "nexus-active-context";

/**
 * Reads the last-selected context from a cookie. This is a UX hint ONLY -
 * resolveActiveContext() below re-validates it against the server-computed
 * access profile on every request, so a tampered or stale cookie can never
 * grant access to a tenant the user is not actually a member of.
 */
export function readStoredContext(request: NextRequest): StoredContextRequest | null {
  const raw = request.cookies.get(NEXUS_CONTEXT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredContextRequest> & { id?: string };
    if (parsed.type === "platform") {
      return { type: "platform" };
    }
    if (
      (parsed.type === "organisation" || parsed.type === "merchant") &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { type: parsed.type, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the active "Working as" context for a request. `requested` is
 * whatever the client asked for (cookie or explicit switch request) - it is
 * NEVER trusted directly. The requested id is only honoured if it appears in
 * `profile`, which was itself derived from real membership rows in the
 * database (see getAccessProfile). Anything else falls back to the user's
 * first available organisation, then merchant, then bare platform context.
 */
export function resolveActiveContext(
  profile: AccessProfile,
  requested: StoredContextRequest | null
): ActiveContext {
  if (requested?.type === "platform") {
    // Only meaningful (and only honoured) for platform admins - the same
    // "never trust the client alone" rule applies here as for an
    // organisation/merchant id: the request is only granted if the
    // server-derived profile actually confers platform admin standing.
    if (profile.isPlatformAdmin) {
      return { type: "platform" };
    }
  } else if (requested?.type === "organisation") {
    const match = profile.organisations.find((org) => org.id === requested.id);
    if (match) {
      return { type: "organisation", id: match.id, name: match.name, role: match.role };
    }
  } else if (requested?.type === "merchant") {
    const match = profile.merchants.find((merchant) => merchant.id === requested.id);
    if (match) {
      return {
        type: "merchant",
        id: match.id,
        companyId: match.companyId,
        name: match.name,
        role: match.role,
      };
    }
  }

  if (profile.organisations.length > 0) {
    const first = profile.organisations[0];
    return { type: "organisation", id: first.id, name: first.name, role: first.role };
  }

  if (profile.merchants.length > 0) {
    const first = profile.merchants[0];
    return {
      type: "merchant",
      id: first.id,
      companyId: first.companyId,
      name: first.name,
      role: first.role,
    };
  }

  return { type: "platform" };
}

export function writeContextCookie(response: NextResponse, context: StoredContextRequest | null): void {
  if (!context) {
    response.cookies.delete(NEXUS_CONTEXT_COOKIE);
    return;
  }
  response.cookies.set(NEXUS_CONTEXT_COOKIE, JSON.stringify(context), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
