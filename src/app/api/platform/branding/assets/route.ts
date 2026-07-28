import { NextRequest, NextResponse } from "next/server";
import { getAccessProfile } from "@/lib/platform/accessProfile";
import { createPrivilegedClient } from "@/lib/platform/supabaseServer";
import { recordAuditEvent } from "@/lib/platform/audit";
import {
  BRANDING_ALLOWED_MIME_TYPES,
  BRANDING_ASSET_TYPES,
  BRANDING_BUCKET,
  BRANDING_MAX_FILE_SIZE_BYTES,
  brandingStoragePath,
  canManageBrandingForScope,
  ensureBrandingProfile,
  type BrandingAssetType,
  type BrandingScope,
} from "@/lib/platform/branding";

function isValidScope(scope: string | null): scope is BrandingScope {
  return scope === "platform" || scope === "organisation" || scope === "merchant";
}

function isValidAssetType(assetType: string | null): assetType is BrandingAssetType {
  return Boolean(assetType) && BRANDING_ASSET_TYPES.includes(assetType as BrandingAssetType);
}

export async function POST(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart/form-data with a file." }, { status: 400 });
  }

  const scopeField = formData.get("scope");
  const scopeIdField = formData.get("scopeId");
  const assetTypeField = formData.get("assetType");
  const file = formData.get("file");

  const scopeValue = typeof scopeField === "string" ? scopeField : null;
  const scopeId = typeof scopeIdField === "string" && scopeIdField.length > 0 ? scopeIdField : null;
  const assetTypeValue = typeof assetTypeField === "string" ? assetTypeField : null;

  if (!isValidScope(scopeValue) || (scopeValue !== "platform" && !scopeId)) {
    return NextResponse.json({ error: "A valid scope (and scopeId for organisation/merchant) is required." }, { status: 400 });
  }
  if (!isValidAssetType(assetTypeValue)) {
    return NextResponse.json({ error: "A valid assetType is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  const extension = BRANDING_ALLOWED_MIME_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Unsupported file type. Please upload PNG, JPG, WebP, or SVG." }, { status: 400 });
  }
  if (file.size > BRANDING_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 5MB size limit." }, { status: 400 });
  }
  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (/<script|on\w+\s*=|javascript:/i.test(text)) {
      return NextResponse.json({ error: "SVG file contains disallowed script content." }, { status: 400 });
    }
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const canManage = await canManageBrandingForScope(privilegedClient, result.value, scopeValue, scopeId);
  if (!canManage) {
    return NextResponse.json({ error: "You do not have permission to manage this branding profile." }, { status: 403 });
  }

  const profile = await ensureBrandingProfile(privilegedClient, scopeValue, scopeId);
  const storagePath = brandingStoragePath(scopeValue, scopeId, assetTypeValue, extension);

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await privilegedClient.storage
    .from(BRANDING_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: asset, error } = await privilegedClient
    .from("branding_assets")
    .upsert(
      {
        branding_profile_id: profile.id,
        asset_type: assetTypeValue,
        storage_bucket: BRANDING_BUCKET,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        created_by: result.value.userId,
      },
      { onConflict: "branding_profile_id,asset_type" }
    )
    .select("*")
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: error?.message ?? "Failed to save branding asset." }, { status: 500 });
  }

  await recordAuditEvent(privilegedClient, {
    actorUserId: result.value.userId,
    organisationId: scopeValue === "organisation" ? scopeId : null,
    merchantId: scopeValue === "merchant" ? scopeId : null,
    action: "branding.asset_uploaded",
    entityType: "branding_asset",
    entityId: asset.id,
    metadata: { scope: scopeValue, assetType: assetTypeValue, mimeType: file.type, fileSizeBytes: file.size },
  });

  const { data: publicUrl } = privilegedClient.storage.from(BRANDING_BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({ asset, url: publicUrl.publicUrl }, { status: 201 });
}

/** DELETE removes a scope's override for one asset type - i.e. "restore inherited branding". */
export async function DELETE(request: NextRequest) {
  const result = await getAccessProfile(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const scopeValue = request.nextUrl.searchParams.get("scope");
  const scopeId = request.nextUrl.searchParams.get("scopeId");
  const assetTypeValue = request.nextUrl.searchParams.get("assetType");

  if (!isValidScope(scopeValue) || (scopeValue !== "platform" && !scopeId)) {
    return NextResponse.json({ error: "A valid scope (and scopeId for organisation/merchant) is required." }, { status: 400 });
  }
  if (!isValidAssetType(assetTypeValue)) {
    return NextResponse.json({ error: "A valid assetType is required." }, { status: 400 });
  }

  const privilegedClient = createPrivilegedClient();
  if (!privilegedClient) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const canManage = await canManageBrandingForScope(privilegedClient, result.value, scopeValue, scopeId);
  if (!canManage) {
    return NextResponse.json({ error: "You do not have permission to manage this branding profile." }, { status: 403 });
  }

  const profile = await ensureBrandingProfile(privilegedClient, scopeValue, scopeId);

  const { data: existingAsset } = await privilegedClient
    .from("branding_assets")
    .select("id, storage_path")
    .eq("branding_profile_id", profile.id)
    .eq("asset_type", assetTypeValue)
    .maybeSingle();

  if (existingAsset) {
    await privilegedClient.storage.from(BRANDING_BUCKET).remove([existingAsset.storage_path]);
    const { error } = await privilegedClient.from("branding_assets").delete().eq("id", existingAsset.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAuditEvent(privilegedClient, {
      actorUserId: result.value.userId,
      organisationId: scopeValue === "organisation" ? scopeId : null,
      merchantId: scopeValue === "merchant" ? scopeId : null,
      action: "branding.asset_removed",
      entityType: "branding_asset",
      entityId: existingAsset.id,
      metadata: { scope: scopeValue, assetType: assetTypeValue },
    });
  }

  return NextResponse.json({ ok: true });
}
