import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAuthClient() {
  if (!supabaseUrl || !supabasePublicKey) return null;
  return createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createPrivilegedClient() {
  if (!supabaseUrl || !supabaseServerKey) return null;
  return createClient(supabaseUrl, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAdminRole(role: string | null): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return [
    "admin",
    "owner",
    "operations_admin",
    "ops_admin",
    "platform_admin",
    "super_admin",
  ].includes(normalized);
}

function pick(map: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (map[k]?.trim()) return map[k].trim();
  }
  return "";
}

type ReadinessResult = {
  ready: boolean;
  missingFields: string[];
};

function evaluateTrackPodReadiness(
  fields: Record<string, string>,
  draftJob: Record<string, unknown>
): ReadinessResult {
  const packageType = pick(fields, "package_type", "packageType", "pkg_type");
  const dimensions = pick(fields, "dimensions");
  const volume = pick(fields, "volume", "cbm");
  const weight = pick(fields, "weight_kg", "weight", "total_weight_kg");

  const required: Array<{ label: string; value: string }> = [
    { label: "Delivery name", value: pick(fields, "delivery_name", "client", "customer") || String(draftJob.delivery_company ?? "").trim() },
    { label: "Delivery address", value: pick(fields, "delivery_address") || String(draftJob.delivery_address_line1 ?? "").trim() },
    { label: "Delivery postcode", value: pick(fields, "delivery_postcode") || String(draftJob.delivery_postcode ?? "").trim() },
    { label: "Delivery phone", value: pick(fields, "delivery_phone", "telephone", "phone") || String(draftJob.delivery_phone ?? "").trim() },
    { label: "Delivery email", value: pick(fields, "delivery_email", "email") || String(draftJob.delivery_email ?? "").trim() },
    { label: "Collection name", value: pick(fields, "collection_name", "shipper", "shipper_name") || String(draftJob.collection_company ?? "").trim() },
    { label: "Collection address", value: pick(fields, "collection_address") || String(draftJob.collection_address_line1 ?? "").trim() },
    { label: "Collection postcode", value: pick(fields, "collection_postcode") || String(draftJob.collection_postcode ?? "").trim() },
    { label: "Collection phone", value: pick(fields, "collection_phone", "telephone", "phone") || String(draftJob.collection_phone ?? "").trim() },
    { label: "Collection email", value: pick(fields, "collection_email", "email") || String(draftJob.collection_email ?? "").trim() },
    { label: "Goods description", value: pick(fields, "goods_description", "goods") || String(draftJob.goods_description ?? "").trim() },
    { label: "Goods quantity", value: pick(fields, "quantity", "total_quantity", "qty") || String(draftJob.total_quantity ?? "").trim() },
    { label: "Package type", value: packageType },
  ];

  const missing = required.filter((item) => !item.value).map((item) => item.label);
  if (!volume && !dimensions) {
    missing.push("Goods volume or dimensions");
  }
  if (/(pallet|plt)/i.test(packageType) && !weight) {
    missing.push("Goods weight");
  }

  return {
    ready: missing.length === 0,
    missingFields: missing,
  };
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = parseBearerToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
    }

    const authClient = createAuthClient();
    const privilegedClient = createPrivilegedClient();
    if (!authClient || !privilegedClient) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await privilegedClient
      .from("profiles")
      .select("id, company_id, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile?.company_id) {
      return NextResponse.json({ error: "No company linked to user" }, { status: 403 });
    }

    const requestedScope = request.nextUrl.searchParams.get("scope") === "admin" ? "admin" : "merchant";
    const adminScope = requestedScope === "admin" && isAdminRole((profile as { role?: string | null }).role ?? null);
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";

    // Fetch all jobs for this company regardless of lifecycle status
    // Process-it shows the full picture: pending, sent, and errors
    let jobsQuery = privilegedClient
      .from("draft_jobs")
      .select(
        [
          "id",
          "job_reference",
          "status",
          "lifecycle_status",
          "company_id",
          "customer",
          "external_order_id",
          "primary_document_id",
          "trackpod_delivery_order_id",
          "trackpod_collection_order_id",
          "trackpod_delivery_tracking_url",
          "trackpod_collection_tracking_url",
          "trackpod_error_detail",
          "trackpod_error_at",
          "trackpod_push_attempted_at",
          "trackpod_push_completed_at",
          "document_url",
          "document_filename",
          "document_file_type",
          "current_status",
          "route_status",
          "route_date",
          "eta_window",
          "driver_name",
          "vehicle_name",
          "collection_status",
          "delivery_status",
          "pod_available",
          "xero_draft_invoice_id",
          "commercial_total",
          "payment_status",
          "booking_profile_id",
          "collection_company",
          "collection_address_line1",
          "collection_postcode",
          "collection_phone",
          "collection_email",
          "delivery_company",
          "delivery_address_line1",
          "delivery_postcode",
          "delivery_phone",
          "delivery_email",
          "goods_description",
          "total_quantity",
          "total_packages",
          "total_pallet_count",
          "total_weight_kg",
          "integration_metadata",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (!adminScope) {
      jobsQuery = jobsQuery.eq("company_id", profile.company_id);
    } else if (requestedCompanyId) {
      jobsQuery = jobsQuery.eq("company_id", requestedCompanyId);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    // Fetch all extracted fields for these jobs in one query (via primary_document_id)
    const documentIds = jobs
      .map((j: unknown) => (j as Record<string, unknown>).primary_document_id)
      .filter(Boolean) as string[];

    const extractedFieldsIndex: Record<string, Record<string, string>> = {};

    if (documentIds.length > 0) {
      const { data: allFields } = await privilegedClient
        .from("document_extracted_fields")
        .select("document_id, field_name, field_value")
        .in("document_id", documentIds);

      if (allFields) {
        for (const field of allFields as Array<{
          document_id: string;
          field_name: string;
          field_value: string | null;
        }>) {
          if (!extractedFieldsIndex[field.document_id]) {
            extractedFieldsIndex[field.document_id] = {};
          }
          if (field.field_value != null) {
            extractedFieldsIndex[field.document_id][field.field_name] = field.field_value;
          }
        }
      }
    }

    const companyIds = Array.from(
      new Set(
        (jobs as Array<{ company_id?: string | null }> | null | undefined ?? [])
          .map((job) => job.company_id?.trim() ?? "")
          .filter(Boolean)
      )
    );

    const companyNames = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: companyRows } = await privilegedClient
        .from("companies")
        .select("id, name")
        .in("id", companyIds)
        .returns<Array<{ id: string; name: string | null }>>();

      for (const company of companyRows ?? []) {
        if (company.id && company.name) {
          companyNames.set(company.id, company.name);
        }
      }
    }

    // Merge everything into the response shape
    const result = (jobs as unknown as Array<Record<string, unknown>>).map((job) => {
      const docId = job.primary_document_id as string | null;
      const extractedFields = docId ? (extractedFieldsIndex[docId] ?? {}) : {};

      // Fall back to integration_metadata.trackPodMapping when document_extracted_fields
      // are not yet populated (e.g. table missing or upload-review path).
      const meta = job.integration_metadata;
      const mappingFallback =
        meta && typeof meta === "object" &&
        (meta as Record<string, unknown>).trackPodMapping &&
        typeof (meta as Record<string, unknown>).trackPodMapping === "object"
          ? ((meta as Record<string, unknown>).trackPodMapping as Record<string, string>)
          : {};

      const fields: Record<string, string> = { ...mappingFallback, ...extractedFields };
      const lifecycleMeta =
        meta && typeof meta === "object" &&
        (meta as Record<string, unknown>).lifecycle &&
        typeof (meta as Record<string, unknown>).lifecycle === "object"
          ? ((meta as Record<string, unknown>).lifecycle as Record<string, unknown>)
          : {};

      const releasePolicy =
        meta && typeof meta === "object" &&
        (meta as Record<string, unknown>).releasePolicy &&
        typeof (meta as Record<string, unknown>).releasePolicy === "object"
          ? ((meta as Record<string, unknown>).releasePolicy as Record<string, unknown>)
          : {};

      const readinessMeta =
        meta && typeof meta === "object" &&
        (meta as Record<string, unknown>).readiness &&
        typeof (meta as Record<string, unknown>).readiness === "object"
          ? ((meta as Record<string, unknown>).readiness as Record<string, unknown>)
          : {};

      const collectionConfirmedAt =
        typeof lifecycleMeta.collectionConfirmedAt === "string"
          ? lifecycleMeta.collectionConfirmedAt
          : null;

      const holdReason =
        typeof releasePolicy.status === "string" && releasePolicy.status === "held_future_date"
          ? "HELD - FUTURE DATE"
          : null;

      const hasCollectionOrder = Boolean(job.trackpod_collection_order_id);
      const hasDeliveryOrder = Boolean(job.trackpod_delivery_order_id);
      const evaluatedReadiness = evaluateTrackPodReadiness(fields, job);
      const persistedMissing = Array.isArray(readinessMeta.missingFields)
        ? readinessMeta.missingFields.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const readinessMissingFields = persistedMissing.length > 0 ? persistedMissing : evaluatedReadiness.missingFields;
      const readinessStatus = readinessMissingFields.length > 0 ? "NEEDS_REVIEW" : "READY_FOR_TRACKPOD";

      const nextRequiredAction = readinessStatus === "NEEDS_REVIEW"
        ? `Needs review: ${readinessMissingFields.join(", ")}`
        : !hasCollectionOrder
        ? "Release collection"
        : !collectionConfirmedAt
          ? "Confirm collection"
          : !hasDeliveryOrder
            ? "Release delivery"
            : "Monitor live tracking";

      return {
        id: job.id,
        jobReference: job.job_reference ?? null,
        status: job.status,
        lifecycleStatus: job.lifecycle_status ?? null,
        companyId: job.company_id,
        merchantName: companyNames.get(String(job.company_id ?? "")) || "—",
        customerName: typeof job.customer === "string" ? job.customer : "",
        collectionName: pick(fields, "collection_name", "shipper"),
        collectionAddress: pick(fields, "collection_address"),
        collectionPhone: pick(fields, "collection_phone", "telephone", "phone"),
        collectionEmail: pick(fields, "collection_email", "email"),
        deliveryName: pick(fields, "customer", "delivery_name"),
        deliveryAddress: pick(fields, "delivery_address"),
        deliveryPhone: pick(fields, "delivery_phone", "telephone", "phone"),
        deliveryEmail: pick(fields, "delivery_email", "email"),
        goodsDescription: pick(fields, "goods_description", "goods"),
        orderReference: pick(fields, "order_reference"),
        externalOrderReference: typeof job.external_order_id === "string" ? job.external_order_id : "",
        orderNumber: pick(fields, "order_number"),
        bookingProfileId:
          (typeof job.booking_profile_id === "string" && job.booking_profile_id) ||
          (typeof (job.integration_metadata as Record<string, unknown> | null)?.bookingProfileId === "string"
            ? ((job.integration_metadata as Record<string, unknown>).bookingProfileId as string)
            : null),
        bookingProfileName:
          pick(fields, "booking_profile_name") ||
          (typeof (job.integration_metadata as Record<string, unknown> | null)?.bookingProfileName === "string"
            ? ((job.integration_metadata as Record<string, unknown>).bookingProfileName as string)
            : null),
        deliveryDate: pick(fields, "delivery_date"),
        collectionDate: pick(fields, "collection_date"),
        shipperName: pick(fields, "merchant_shipper", "collection_name"),
        trackpodDeliveryOrderId: job.trackpod_delivery_order_id ?? null,
        trackpodCollectionOrderId: job.trackpod_collection_order_id ?? null,
        trackpodDeliveryTrackingUrl: job.trackpod_delivery_tracking_url ?? null,
        trackpodCollectionTrackingUrl: job.trackpod_collection_tracking_url ?? null,
        documentUrl: job.document_url ?? null,
        documentFilename: job.document_filename ?? null,
        documentFileType: job.document_file_type ?? null,
        errorDetail: job.trackpod_error_detail ?? null,
        errorAt: job.trackpod_error_at ?? null,
        pushAttemptedAt: job.trackpod_push_attempted_at ?? null,
        pushCompletedAt: job.trackpod_push_completed_at ?? null,
        xeroInvoiceId: job.xero_draft_invoice_id ?? null,
        commercialTotal: typeof job.commercial_total === "string" ? job.commercial_total : null,
        paymentStatus: typeof job.payment_status === "string" ? job.payment_status : "not_requested",
        currentStatus: job.current_status ?? null,
        routeStatus: job.route_status ?? null,
        routeDate: job.route_date ?? null,
        etaWindow: job.eta_window ?? null,
        driverName: job.driver_name ?? null,
        vehicleName: job.vehicle_name ?? null,
        collectionStatus: job.collection_status ?? null,
        deliveryStatus: job.delivery_status ?? null,
        podAvailable: job.pod_available === true,
        collectionConfirmedAt,
        deliveryHoldReason: holdReason,
        readinessStatus,
        readinessMissingFields,
        nextRequiredAction,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      };
    });

    return NextResponse.json({ jobs: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
