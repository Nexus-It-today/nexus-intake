-- Sprint 1 "Foundation it": Brand it.
--
-- branding_profiles holds the per-scope settings (colours, contact details,
-- "powered by" toggle); branding_assets holds file metadata only - binaries
-- live in Supabase Storage (bucket "branding-assets"), never in Postgres.
-- Inheritance (merchant -> organisation -> platform default) is resolved in
-- application code (src/lib/platform/branding.ts), not in SQL, so it stays
-- easy to reason about and test.

CREATE TABLE IF NOT EXISTS public.branding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'organisation', 'merchant')),
  scope_id UUID,
  display_name TEXT,
  primary_colour TEXT,
  accent_colour TEXT,
  support_email TEXT,
  support_phone TEXT,
  website_url TEXT,
  powered_by_visible BOOLEAN NOT NULL DEFAULT TRUE,
  allow_merchant_branding BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branding_profiles_scope_id_shape CHECK (
    (scope = 'platform' AND scope_id IS NULL)
    OR (scope IN ('organisation', 'merchant') AND scope_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branding_profiles_platform_singleton
ON public.branding_profiles (scope)
WHERE scope = 'platform';

CREATE UNIQUE INDEX IF NOT EXISTS uq_branding_profiles_scope_id
ON public.branding_profiles (scope, scope_id)
WHERE scope_id IS NOT NULL;

DROP TRIGGER IF EXISTS branding_profiles_set_updated_at ON public.branding_profiles;
CREATE TRIGGER branding_profiles_set_updated_at
BEFORE UPDATE ON public.branding_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS public.branding_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branding_profile_id UUID NOT NULL REFERENCES public.branding_profiles(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'primary_logo', 'compact_logo', 'favicon', 'logo_light_bg', 'logo_dark_bg', 'invoice_logo', 'email_header_logo'
  )),
  storage_bucket TEXT NOT NULL DEFAULT 'branding-assets',
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branding_profile_id, asset_type)
);

DROP TRIGGER IF EXISTS branding_assets_set_updated_at ON public.branding_assets;
CREATE TRIGGER branding_assets_set_updated_at
BEFORE UPDATE ON public.branding_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.can_manage_branding(target_scope TEXT, target_scope_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_scope = 'platform' THEN
    RETURN public.current_user_is_super_admin();
  ELSIF target_scope = 'organisation' THEN
    RETURN public.can_manage_organisation(target_scope_id);
  ELSIF target_scope = 'merchant' THEN
    RETURN public.can_manage_merchant(target_scope_id)
      AND COALESCE((
        SELECT bp.allow_merchant_branding
        FROM public.merchants m
        JOIN public.branding_profiles bp
          ON bp.scope = 'organisation' AND bp.scope_id = m.company_id
        WHERE m.id = target_scope_id
      ), TRUE);
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_branding(TEXT, UUID) TO authenticated;

ALTER TABLE public.branding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding_assets ENABLE ROW LEVEL SECURITY;

-- Branding is intentionally public-read: it must be renderable on hosted
-- booking forms, tracking pages and embeds without a signed-in session, and
-- carries no sensitive data (logos, colours, public contact details).
DROP POLICY IF EXISTS branding_profiles_select_public ON public.branding_profiles;
CREATE POLICY branding_profiles_select_public
ON public.branding_profiles
FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS branding_profiles_insert_manage ON public.branding_profiles;
CREATE POLICY branding_profiles_insert_manage
ON public.branding_profiles
FOR INSERT
WITH CHECK (public.can_manage_branding(scope, scope_id));

DROP POLICY IF EXISTS branding_profiles_update_manage ON public.branding_profiles;
CREATE POLICY branding_profiles_update_manage
ON public.branding_profiles
FOR UPDATE
USING (public.can_manage_branding(scope, scope_id))
WITH CHECK (public.can_manage_branding(scope, scope_id));

DROP POLICY IF EXISTS branding_profiles_delete_manage ON public.branding_profiles;
CREATE POLICY branding_profiles_delete_manage
ON public.branding_profiles
FOR DELETE
USING (public.can_manage_branding(scope, scope_id));

DROP POLICY IF EXISTS branding_assets_select_public ON public.branding_assets;
CREATE POLICY branding_assets_select_public
ON public.branding_assets
FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS branding_assets_insert_manage ON public.branding_assets;
CREATE POLICY branding_assets_insert_manage
ON public.branding_assets
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branding_profiles bp
    WHERE bp.id = branding_profile_id AND public.can_manage_branding(bp.scope, bp.scope_id)
  )
);

DROP POLICY IF EXISTS branding_assets_update_manage ON public.branding_assets;
CREATE POLICY branding_assets_update_manage
ON public.branding_assets
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.branding_profiles bp
    WHERE bp.id = branding_profile_id AND public.can_manage_branding(bp.scope, bp.scope_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branding_profiles bp
    WHERE bp.id = branding_profile_id AND public.can_manage_branding(bp.scope, bp.scope_id)
  )
);

DROP POLICY IF EXISTS branding_assets_delete_manage ON public.branding_assets;
CREATE POLICY branding_assets_delete_manage
ON public.branding_assets
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.branding_profiles bp
    WHERE bp.id = branding_profile_id AND public.can_manage_branding(bp.scope, bp.scope_id)
  )
);

-- Seed the singleton platform branding profile (Nexus it defaults). No logo
-- assets are seeded here - those are uploaded through Brand it.
INSERT INTO public.branding_profiles (
  scope, scope_id, display_name, primary_colour, accent_colour, powered_by_visible, allow_merchant_branding
)
VALUES ('platform', NULL, 'Nexus it', '#0F172A', '#2563EB', TRUE, TRUE)
ON CONFLICT (scope) WHERE scope = 'platform' DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding-assets', 'branding-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage path convention: {scope}/{scope_id}/{asset_type}.{ext}
-- Platform scope has no scope_id, so its objects live under platform/global/.
DROP POLICY IF EXISTS branding_assets_storage_select ON storage.objects;
CREATE POLICY branding_assets_storage_select
ON storage.objects
FOR SELECT
USING (bucket_id = 'branding-assets');

DROP POLICY IF EXISTS branding_assets_storage_insert ON storage.objects;
CREATE POLICY branding_assets_storage_insert
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'branding-assets'
  AND (
    (split_part(name, '/', 1) = 'platform' AND public.current_user_is_super_admin())
    OR (split_part(name, '/', 1) = 'organisation' AND public.can_manage_branding('organisation', NULLIF(split_part(name, '/', 2), '')::UUID))
    OR (split_part(name, '/', 1) = 'merchant' AND public.can_manage_branding('merchant', NULLIF(split_part(name, '/', 2), '')::UUID))
  )
);

DROP POLICY IF EXISTS branding_assets_storage_update ON storage.objects;
CREATE POLICY branding_assets_storage_update
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'branding-assets'
  AND (
    (split_part(name, '/', 1) = 'platform' AND public.current_user_is_super_admin())
    OR (split_part(name, '/', 1) = 'organisation' AND public.can_manage_branding('organisation', NULLIF(split_part(name, '/', 2), '')::UUID))
    OR (split_part(name, '/', 1) = 'merchant' AND public.can_manage_branding('merchant', NULLIF(split_part(name, '/', 2), '')::UUID))
  )
);

DROP POLICY IF EXISTS branding_assets_storage_delete ON storage.objects;
CREATE POLICY branding_assets_storage_delete
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'branding-assets'
  AND (
    (split_part(name, '/', 1) = 'platform' AND public.current_user_is_super_admin())
    OR (split_part(name, '/', 1) = 'organisation' AND public.can_manage_branding('organisation', NULLIF(split_part(name, '/', 2), '')::UUID))
    OR (split_part(name, '/', 1) = 'merchant' AND public.can_manage_branding('merchant', NULLIF(split_part(name, '/', 2), '')::UUID))
  )
);

GRANT SELECT ON public.branding_profiles, public.branding_assets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branding_profiles, public.branding_assets TO authenticated;
GRANT ALL ON public.branding_profiles, public.branding_assets TO service_role;

NOTIFY pgrst, 'reload schema';
