import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processIntake, type IntakeGoodsItem, type IntakeOrderInput } from "@/lib/intake/intakeService";
import { notifyOrderCreated } from "@/lib/notify/orderCreated";
import {
  markReceiptFailed,
  markReceiptProcessed,
  markReceiptProcessing,
  persistReceipt,
} from "@/lib/intake/durableReceipt";

type WooMetaEntry = {
  key?: string;
  value?: unknown;
};

type WooLineItem = {
  name?: string;
  sku?: string;
  quantity?: number | string;
  total?: string;
};

type WooStop = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
};

type WooOrder = {
  id?: number | string;
  number?: string;
  status?: string;
  customer_note?: string;
  payment_method_title?: string;
  billing?: WooStop;
  shipping?: WooStop;
  line_items?: WooLineItem[];
  meta_data?: WooMetaEntry[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

type MerchantConnection = {
  company_id: string;
  configuration: Record<string, unknown>;
};

function createPrivilegedClient() {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildMetaMap(meta: WooMetaEntry[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of meta ?? []) {
    const key = text(entry?.key).toLowerCase();
    if (!key) continue;
    map.set(key, text(entry?.value));
  }
  return map;
}

function fromMeta(meta: Map<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = meta.get(key.toLowerCase()) ?? "";
    if (value) return value;
  }
  return "";
}

function buildContact(stop: WooStop | undefined): string {
  const first = text(stop?.first_name);
  const last = text(stop?.last_name);
  return [first, last].filter(Boolean).join(" ");
}

function buildAddressLine1(stop: WooStop | undefined): string {
  return [text(stop?.address_1), text(stop?.city)].filter(Boolean).join(", ") || text(stop?.address_1);
}

function buildAddressLine2(stop: WooStop | undefined): string {
  return [text(stop?.address_2), text(stop?.state)].filter(Boolean).join(", ");
}

function mapGoods(lineItems: WooLineItem[] | undefined): IntakeGoodsItem[] {
  const mapped = (lineItems ?? []).map((line): IntakeGoodsItem => {
    const quantity = Math.max(1, Math.round(toNumber(line.quantity) || 1));
    const total = toNumber(line.total);
    const unitPrice = quantity > 0 ? total / quantity : total;

    return {
      description: text(line.name) || "WooCommerce item",
      productCode: text(line.sku),
      quantity,
      packages: quantity,
      palletCount: 0,
      weightKg: 0,
      unitPrice,
      lineTotal: total,
      vatRate: 20,
      itemType: "product",
    };
  });

  return mapped.length > 0
    ? mapped
    : [
        {
          description: "WooCommerce order",
          quantity: 1,
          packages: 1,
          palletCount: 0,
          weightKg: 0,
          unitPrice: 0,
          lineTotal: 0,
          vatRate: 20,
          itemType: "service",
        },
      ];
}

function resolveCollectionStop(order: WooOrder, meta: Map<string, string>): IntakeOrderInput["collection"] {
  const shipping = order.shipping ?? {};
  const billing = order.billing ?? {};

  const company =
    fromMeta(meta, "nexus_collection_company", "collection_company") ||
    text(shipping.company) ||
    text(billing.company) ||
    "Collection";

  const contact =
    fromMeta(meta, "nexus_collection_contact", "collection_contact") ||
    buildContact(shipping) ||
    buildContact(billing);

  const addressRaw = fromMeta(meta, "nexus_collection_address", "collection_address");
  const addressLine1 = addressRaw || buildAddressLine1(shipping) || buildAddressLine1(billing);

  const notes = fromMeta(meta, "nexus_collection_notes", "collection_notes");
  const phone =
    fromMeta(meta, "nexus_collection_phone", "collection_phone") ||
    text(shipping.phone) ||
    text(billing.phone);
  const email =
    fromMeta(meta, "nexus_collection_email", "collection_email") ||
    text(shipping.email) ||
    text(billing.email);

  return {
    company,
    contact,
    addressLine1,
    addressLine2: buildAddressLine2(shipping) || buildAddressLine2(billing),
    addressLine3: "",
    postcode:
      fromMeta(meta, "nexus_collection_postcode", "collection_postcode") ||
      text(shipping.postcode) ||
      text(billing.postcode),
    country:
      fromMeta(meta, "nexus_collection_country", "collection_country") ||
      text(shipping.country) ||
      text(billing.country) ||
      "GB",
    phone,
    email,
    date: fromMeta(meta, "nexus_collection_date", "collection_date"),
    time: fromMeta(meta, "nexus_collection_time", "collection_time"),
    instructions: notes,
    latitude: fromMeta(meta, "nexus_collection_latitude", "collection_latitude"),
    longitude: fromMeta(meta, "nexus_collection_longitude", "collection_longitude"),
  };
}

function resolveDeliveryStop(order: WooOrder, meta: Map<string, string>): IntakeOrderInput["delivery"] {
  const shipping = order.shipping ?? {};
  const billing = order.billing ?? {};

  return {
    company: text(shipping.company) || text(billing.company) || "Delivery",
    contact: buildContact(shipping) || buildContact(billing),
    addressLine1: buildAddressLine1(shipping) || buildAddressLine1(billing),
    addressLine2: buildAddressLine2(shipping) || buildAddressLine2(billing),
    addressLine3: "",
    postcode: text(shipping.postcode) || text(billing.postcode),
    country: text(shipping.country) || text(billing.country) || "GB",
    phone: text(shipping.phone) || text(billing.phone),
    email: text(shipping.email) || text(billing.email),
    date: fromMeta(meta, "nexus_delivery_date", "delivery_date"),
    time: fromMeta(meta, "nexus_delivery_time", "delivery_time"),
    instructions: text(order.customer_note),
    latitude: fromMeta(meta, "nexus_delivery_latitude", "delivery_latitude"),
    longitude: fromMeta(meta, "nexus_delivery_longitude", "delivery_longitude"),
  };
}

function resolveCompanyId(order: WooOrder, meta: Map<string, string>, request: NextRequest): string {
  return (
    request.nextUrl.searchParams.get("company_id")?.trim() ||
    fromMeta(meta, "nexus_company_id", "_nexus_company_id") ||
    fromMeta(meta, "company_id") ||
    ""
  );
}

function resolveWebhookSecret(request: NextRequest): string {
  return (
    request.headers.get("x-nexus-webhook-secret")?.trim() ||
    request.headers.get("x-woocommerce-webhook-secret")?.trim() ||
    ""
  );
}

async function loadWooConnection(client: ReturnType<typeof createPrivilegedClient>, companyId: string): Promise<MerchantConnection | null> {
  if (!client) return null;

  const { data, error } = await client
    .from("merchant_integration_connections")
    .select("company_id, configuration")
    .eq("company_id", companyId)
    .eq("provider_key", "woocommerce")
    .eq("connected", true)
    .maybeSingle<MerchantConnection>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

function buildIntakeInput(order: WooOrder, companyId: string, meta: Map<string, string>): IntakeOrderInput {
  const goods = mapGoods(order.line_items);
  const collection = resolveCollectionStop(order, meta);
  const delivery = resolveDeliveryStop(order, meta);

  return {
    sourceSystem: "woocommerce",
    collectionMode: "new_address",
    companyId,
    externalOrderId: String(order.id ?? "").trim() || null,
    orderReference: text(order.number) || String(order.id ?? ""),
    salesChannelName: "WooCommerce",
    customer: delivery.contact || delivery.company,
    merchant: collection.company,
    priority: "Normal",
    notes: [text(order.customer_note), text(order.payment_method_title), text(order.status)].filter(Boolean).join(" | "),
    collection,
    delivery,
    goods,
    commercial: {
      purchaseOrder: fromMeta(meta, "nexus_purchase_order", "purchase_order"),
      net: fromMeta(meta, "nexus_net", "net_amount"),
      vat: fromMeta(meta, "nexus_vat", "vat_amount"),
      total: fromMeta(meta, "nexus_total", "total_amount"),
      invoiceRequired: true,
    },
    operations: {
      serviceType: fromMeta(meta, "nexus_service_type", "service_type") || "Home Delivery",
      route: fromMeta(meta, "nexus_route", "route"),
      shipper: collection.company,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const client = createPrivilegedClient();
    if (!client) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const rawPayload = await request.text();
    const payload = (JSON.parse(rawPayload || "{}")) as WooOrder;
    const meta = buildMetaMap(payload.meta_data);
    const companyId = resolveCompanyId(payload, meta, request);

    if (!companyId) {
      return NextResponse.json(
        { error: "Missing company_id. Pass query ?company_id=... or include nexus_company_id in Woo order meta." },
        { status: 400 }
      );
    }

    const connection = await loadWooConnection(client, companyId);
    if (!connection) {
      return NextResponse.json({ error: "WooCommerce provider is not connected for this company" }, { status: 403 });
    }

    const configuredSecret = text(asRecord(connection.configuration).webhook_secret);
    const incomingSecret = resolveWebhookSecret(request);
    if (!configuredSecret || !incomingSecret || configuredSecret !== incomingSecret) {
      return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
    }

    const externalOrderId = String(payload.id ?? "").trim();
    if (!externalOrderId) {
      return NextResponse.json({ error: "WooCommerce order id is required" }, { status: 400 });
    }
    const eventType = request.headers.get("x-wc-webhook-topic")?.trim() || "order.updated";
    const deliveryId = request.headers.get("x-wc-webhook-delivery-id")?.trim();
    const receipt = await persistReceipt(
      client,
      {
        companyId,
        sourceSystem: "woocommerce",
        eventType,
        externalEventId: deliveryId || `${eventType}:${externalOrderId}:${text(payload.status) || "unknown"}`,
        externalOrderId,
        payload,
      },
      rawPayload,
    );
    if (receipt.duplicate && receipt.status === "processed") {
      return NextResponse.json({
        success: true,
        duplicate: true,
        jobId: receipt.draftJobId,
        receiptId: receipt.id,
      });
    }
    if (receipt.duplicate && receipt.status === "processing") {
      return NextResponse.json(
        { success: true, retained: true, processing: true, receiptId: receipt.id },
        { status: 202 },
      );
    }
    await markReceiptProcessing(client, receipt.id);

    const intakeInput = buildIntakeInput(payload, companyId, meta);
    const result = await processIntake(intakeInput, client);

    if (!result.success) {
      await markReceiptFailed(client, receipt.id, result.error || "Intake processing failed");
      return NextResponse.json({ error: result.error, validationErrors: result.validationErrors ?? [] }, { status: 400 });
    }

    await markReceiptProcessed(
      client,
      receipt.id,
      companyId,
      result.jobId,
      `woocommerce:${companyId}:${externalOrderId}`,
    );

    await notifyOrderCreated({
      client,
      draftJobId: result.jobId,
      companyId,
      orderReference: result.jobReference,
      customerName: intakeInput.delivery.contact || intakeInput.delivery.company,
      customerEmail: intakeInput.delivery.email,
      customerPhone: intakeInput.delivery.phone,
    });

    try {
      await client.from("discuss_it_timeline").insert({
        company_id: companyId,
        draft_job_id: result.jobId,
        event_type: "ORDER_RECEIVED",
        event_source: "woocommerce_webhook",
        event_summary: `WooCommerce order imported: ${intakeInput.orderReference || result.jobReference}`,
        payload: {
          sourceSystem: "woocommerce",
          externalOrderId: intakeInput.externalOrderId,
          orderReference: intakeInput.orderReference,
          importedAt: new Date().toISOString(),
          status: text(payload.status),
        },
      });
    } catch {
      // timeline is non-blocking
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      jobReference: result.jobReference,
      lifecycleStatus: result.lifecycleStatus,
      receiptId: receipt.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
