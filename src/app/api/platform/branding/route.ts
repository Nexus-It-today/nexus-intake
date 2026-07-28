import { NextRequest, NextResponse } from "next/server";
import { createAuthClient, createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { resolveBranding } from "@/lib/platform/branding";

/**
 * Public, unauthenticated branding read - used by the app header, hosted
 * booking forms, tracking pages and embeds. branding_profiles/branding_assets
 * have RLS `SELECT USING (TRUE)`, so the anon-key client is sufficient and no
 * service-role credentials are needed for this route.
 */
export async function GET(request: NextRequest) {
  const merchantId = request.nextUrl.searchParams.get("merchantId");
  const organisationId = request.nextUrl.searchParams.get("organisationId");

  const anonClient = createAuthClient();
  const client = anonClient ?? createPrivilegedClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let resolvedOrganisationId = organisationId;
  if (merchantId && !organisationId) {
    // `merchants` RLS requires an authenticated membership/role check, so an
    // anonymous request can never read it directly. This lookup only needs
    // the (non-sensitive) organisation_id to resolve the inheritance chain -
    // it never returns merchant data to the caller - so the privileged
    // client is used here specifically, while branding_profiles/assets reads
    // below stay on the public anon client.
    const privilegedClient = createPrivilegedClient();
    const { data: merchant } = privilegedClient
      ? await privilegedClient.from("merchants").select("organisation_id").eq("id", merchantId).maybeSingle()
      : { data: null };
    resolvedOrganisationId = merchant?.organisation_id ?? null;
  }

  const branding = await resolveBranding(client, {
    merchantId: merchantId ?? null,
    organisationId: resolvedOrganisationId,
  });

  return NextResponse.json({ branding });
}
