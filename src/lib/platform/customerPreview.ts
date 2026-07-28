import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessProfile } from "./accessProfile";
import { createPrivilegedClient } from "./supabaseServer";

type CustomerRow = {
  id: string;
  company_id: string;
  customer_name: string;
  email: string | null;
  contact_name: string | null;
};

export type CustomerPreviewContext = {
  companyId: string;
  merchantCustomerId: string;
  customerEmail: string;
  customerName: string;
  contactName: string | null;
  privilegedClient: SupabaseClient;
};

/**
 * Master Admin "preview as Customer" - resolves an arbitrary customer by id
 * (rather than the caller's own auth.uid(), as the customer portal itself
 * does) and requires the caller to be a Nexus platform admin. Read-only by
 * construction: this module has no write helpers.
 */
export async function getCustomerPreviewContext(
  request: NextRequest,
  customerId: string
): Promise<{ ok: true; value: CustomerPreviewContext } | { ok: false; error: string; status: number }> {
  const accessResult = await getAccessProfile(request);
  if (!accessResult.ok) {
    return { ok: false, error: accessResult.error, status: accessResult.status };
  }
  if (!accessResult.value.isPlatformAdmin) {
    return { ok: false, error: "Only Nexus platform admins can preview a customer.", status: 403 };
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  const { data: customer, error } = await privilegedClient
    .from("merchant_customers")
    .select("id, company_id, customer_name, email, contact_name")
    .eq("id", customerId)
    .maybeSingle<CustomerRow>();

  if (error || !customer) {
    return { ok: false, error: "Customer not found.", status: 404 };
  }

  return {
    ok: true,
    value: {
      companyId: customer.company_id,
      merchantCustomerId: customer.id,
      customerEmail: customer.email ?? "",
      customerName: customer.customer_name,
      contactName: customer.contact_name,
      privilegedClient,
    },
  };
}
