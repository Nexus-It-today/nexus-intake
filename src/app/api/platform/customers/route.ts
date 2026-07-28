import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";

type CustomerSearchRow = {
  id: string;
  company_id: string;
  customer_name: string;
  email: string | null;
  contact_name: string | null;
};

/**
 * Master Admin "preview as Customer" picker - read-only search across
 * merchant_customers, platform-admin only. Does not scope by organisation or
 * merchant: the new Foundation it tenancy model and the legacy company_id
 * that operational data (merchant_customers, draft_jobs) still uses are not
 * yet bridged (see docs/NEXUS-IT-PLATFORM-1.0-ARCHITECTURE.md §10), so this
 * intentionally searches every customer rather than pretending to filter by
 * the currently selected merchant.
 */
export async function GET(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.value.isPlatformAdmin) {
    return NextResponse.json({ error: "Only Nexus platform admins can search customers to preview." }, { status: 403 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
  if (!search) {
    return NextResponse.json({ customers: [] });
  }

  const safe = search.replaceAll(",", " ").replaceAll("%", "");
  const { data, error } = await privilegedClient
    .from("merchant_customers")
    .select("id, company_id, customer_name, email, contact_name")
    .or(`customer_name.ilike.%${safe}%,email.ilike.%${safe}%,contact_name.ilike.%${safe}%`)
    .order("customer_name", { ascending: true })
    .limit(25)
    .returns<CustomerSearchRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data ?? [] });
}
