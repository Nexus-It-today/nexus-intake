-- Foundation security prerequisite aligned to the live companies-based schema.
-- This migration intentionally keeps organisation-named helper APIs for backward
-- compatibility while implementing them against public.companies.

DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.companies';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.profiles';
  END IF;

  IF to_regclass('public.merchants') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.merchants';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.companies.id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.profiles.auth_user_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.profiles.company_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.profiles.role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.merchants.id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'organisation_id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.merchants.organisation_id';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_platform_admin_helper BOOLEAN;
  platform_admin_result BOOLEAN;
BEGIN
  SELECT to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL
  INTO has_platform_admin_helper;

  IF has_platform_admin_helper THEN
    EXECUTE 'SELECT public.is_platform_admin(auth.uid())'
    INTO platform_admin_result;

    IF COALESCE(platform_admin_result, FALSE) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND lower(COALESCE(p.role, '')) IN ('super_admin', 'platform_admin', 'admin', 'owner')
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.organisation_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'organisation_owner', 'organisation_admin', 'organisation_operator', 'organisation_viewer'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.merchant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'merchant_owner', 'merchant_admin', 'merchant_operator', 'merchant_viewer'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organisation_memberships_organisation_id
  ON public.organisation_memberships (organisation_id);
CREATE INDEX IF NOT EXISTS idx_organisation_memberships_user_id
  ON public.organisation_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_memberships_merchant_id
  ON public.merchant_memberships (merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_memberships_user_id
  ON public.merchant_memberships (user_id);

DROP TRIGGER IF EXISTS organisation_memberships_set_updated_at ON public.organisation_memberships;
CREATE TRIGGER organisation_memberships_set_updated_at
BEFORE UPDATE ON public.organisation_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS merchant_memberships_set_updated_at ON public.merchant_memberships;
CREATE TRIGGER merchant_memberships_set_updated_at
BEFORE UPDATE ON public.merchant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.has_organisation_role(target_organisation_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_memberships om
    WHERE om.organisation_id = target_organisation_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_merchant_role(target_merchant_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_memberships mm
    WHERE mm.merchant_id = target_merchant_id
      AND mm.user_id = auth.uid()
      AND mm.status = 'active'
      AND mm.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_organisation(target_organisation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.company_id = target_organisation_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.organisation_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organisation_id = target_organisation_id
      AND om.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_organisation(target_organisation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.company_id = target_organisation_id
      AND lower(COALESCE(p.role, '')) IN (
        'company_admin',
        'operations_admin',
        'operations',
        'super_admin',
        'platform_admin',
        'admin',
        'owner'
      )
  )
  OR public.has_organisation_role(target_organisation_id, ARRAY['organisation_owner', 'organisation_admin']);
$$;

CREATE OR REPLACE FUNCTION public.can_access_merchant(target_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_super_admin()
  OR public.has_merchant_role(target_merchant_id, ARRAY[
    'merchant_owner',
    'merchant_admin',
    'merchant_operator',
    'merchant_viewer'
  ])
  OR EXISTS (
    SELECT 1
    FROM public.merchants m
    WHERE m.id = target_merchant_id
      AND public.can_access_organisation(m.organisation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_merchant(target_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_super_admin()
  OR public.has_merchant_role(target_merchant_id, ARRAY['merchant_owner', 'merchant_admin'])
  OR EXISTS (
    SELECT 1
    FROM public.merchants m
    WHERE m.id = target_merchant_id
      AND public.can_manage_organisation(m.organisation_id)
  );
$$;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchants_select ON public.merchants;
CREATE POLICY merchants_select
ON public.merchants
FOR SELECT
USING (public.can_access_organisation(organisation_id) OR public.can_access_merchant(id));

DROP POLICY IF EXISTS merchants_insert ON public.merchants;
CREATE POLICY merchants_insert
ON public.merchants
FOR INSERT
WITH CHECK (public.can_manage_organisation(organisation_id));

DROP POLICY IF EXISTS merchants_update ON public.merchants;
CREATE POLICY merchants_update
ON public.merchants
FOR UPDATE
USING (public.can_manage_organisation(organisation_id) OR public.can_manage_merchant(id))
WITH CHECK (public.can_manage_organisation(organisation_id) OR public.can_manage_merchant(id));

ALTER TABLE public.organisation_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisation_memberships_select ON public.organisation_memberships;
CREATE POLICY organisation_memberships_select
ON public.organisation_memberships
FOR SELECT
USING (user_id = auth.uid() OR public.can_access_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_memberships_insert ON public.organisation_memberships;
CREATE POLICY organisation_memberships_insert
ON public.organisation_memberships
FOR INSERT
WITH CHECK (public.can_manage_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_memberships_update ON public.organisation_memberships;
CREATE POLICY organisation_memberships_update
ON public.organisation_memberships
FOR UPDATE
USING (public.can_manage_organisation(organisation_id))
WITH CHECK (public.can_manage_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_memberships_delete ON public.organisation_memberships;
CREATE POLICY organisation_memberships_delete
ON public.organisation_memberships
FOR DELETE
USING (public.can_manage_organisation(organisation_id));

ALTER TABLE public.merchant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_memberships_select ON public.merchant_memberships;
CREATE POLICY merchant_memberships_select
ON public.merchant_memberships
FOR SELECT
USING (user_id = auth.uid() OR public.can_access_merchant(merchant_id));

DROP POLICY IF EXISTS merchant_memberships_insert ON public.merchant_memberships;
CREATE POLICY merchant_memberships_insert
ON public.merchant_memberships
FOR INSERT
WITH CHECK (public.can_manage_merchant(merchant_id));

DROP POLICY IF EXISTS merchant_memberships_update ON public.merchant_memberships;
CREATE POLICY merchant_memberships_update
ON public.merchant_memberships
FOR UPDATE
USING (public.can_manage_merchant(merchant_id))
WITH CHECK (public.can_manage_merchant(merchant_id));

DROP POLICY IF EXISTS merchant_memberships_delete ON public.merchant_memberships;
CREATE POLICY merchant_memberships_delete
ON public.merchant_memberships
FOR DELETE
USING (public.can_manage_merchant(merchant_id));

DO $$
BEGIN
  IF to_regprocedure('public.current_user_is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.current_user_is_super_admin()';
  END IF;

  IF to_regprocedure('public.set_updated_at_timestamp()') IS NULL THEN
    RAISE EXCEPTION 'Missing required trigger function after migration: public.set_updated_at_timestamp()';
  END IF;

  IF to_regprocedure('public.has_organisation_role(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.has_organisation_role(UUID, TEXT[])';
  END IF;

  IF to_regprocedure('public.has_merchant_role(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.has_merchant_role(UUID, TEXT[])';
  END IF;

  IF to_regprocedure('public.can_access_organisation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.can_access_organisation(UUID)';
  END IF;

  IF to_regprocedure('public.can_access_merchant(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.can_access_merchant(UUID)';
  END IF;

  IF to_regprocedure('public.can_manage_organisation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.can_manage_organisation(UUID)';
  END IF;

  IF to_regprocedure('public.can_manage_merchant(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing required helper after migration: public.can_manage_merchant(UUID)';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organisation_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_merchant_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_organisation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organisation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_merchant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_merchant(UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.merchants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_memberships, public.merchant_memberships TO authenticated;
GRANT ALL ON public.merchants, public.organisation_memberships, public.merchant_memberships TO service_role;

NOTIFY pgrst, 'reload schema';
