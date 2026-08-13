import { NextRequest, NextResponse } from "next/server";
import { getPlatformContext } from "@/lib/platform/requestContext";
import { canAccessMerchant } from "@/lib/platform/permissions";
import { SWIFTEAM_CIRCLELOOP_IDENTITY, SWIFTEAM_MASTER_EMAIL } from "@/lib/swifteam";

type IdentityRow = {
  id: string;
  merchant_id: string | null;
  channel: "email" | "phone" | "whatsapp";
  identity_value: string;
  label: string | null;
  is_active: boolean;
};

export async function GET(request: NextRequest) {
  const ctx = await getPlatformContext(request);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const requestedMerchantId = (request.nextUrl.searchParams.get("merchantId") ?? "").trim();
  const contextMerchantId = ctx.activeContext.type === "merchant" ? ctx.activeContext.id : "";
  const merchantId = requestedMerchantId || contextMerchantId;

  if (merchantId && !canAccessMerchant(ctx.accessProfile, merchantId)) {
    return NextResponse.json({ error: "You do not have access to this merchant." }, { status: 403 });
  }

  const [{ data: identities, error: identitiesError }, { data: merchant }] = await Promise.all([
    ctx.privilegedClient
      .from("swifteam_channel_identities")
      .select("id, merchant_id, channel, identity_value, label, is_active")
      .eq("is_active", true)
      .or(merchantId ? `merchant_id.is.null,merchant_id.eq.${merchantId}` : "merchant_id.is.null")
      .order("channel", { ascending: true })
      .returns<IdentityRow[]>(),
    merchantId
      ? ctx.privilegedClient
          .from("merchants")
          .select("id, name")
          .eq("id", merchantId)
          .maybeSingle<{ id: string; name: string }>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (identitiesError) {
    return NextResponse.json({ error: identitiesError.message }, { status: 500 });
  }

  const rows = identities ?? [];
  const primaryEmail =
    rows.find((row) => row.channel === "email")?.identity_value ?? SWIFTEAM_MASTER_EMAIL;
  const primaryPhone =
    rows.find((row) => row.channel === "phone")?.identity_value ?? SWIFTEAM_CIRCLELOOP_IDENTITY;

  return NextResponse.json({
    merchant: merchant ?? null,
    identities: rows,
    primary: {
      email: primaryEmail,
      phone: primaryPhone,
      whatsapp: rows.find((row) => row.channel === "whatsapp")?.identity_value ?? null,
      whatsappPlaceholder: true,
    },
  });
}
