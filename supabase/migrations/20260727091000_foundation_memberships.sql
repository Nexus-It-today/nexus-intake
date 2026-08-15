-- Sprint 1 "Foundation it": canonical membership model.
--
-- Replaces "one global role on profiles" with context-scoped membership rows.
-- A user's role is never a single global attribute - it exists only within an
-- organisation_memberships or merchant_memberships row. Legacy `profiles.role`
-- and `organisation_users` remain in place (read by existing operational
-- code) but are no longer the source of truth for new authorization checks;
-- the can_access_*/can_manage_* helper functions below check them ONLY for
-- backward compatibility and prefer the new membership tables.

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

CREATE INDEX IF NOT EXISTS idx_organisation_memberships_organisation_id ON public.organisation_memberships (organisation_id);
CREATE INDEX IF NOT EXISTS idx_organisation_memberships_user_id ON public.organisation_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_memberships_merchant_id ON public.merchant_memberships (merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_memberships_user_id ON public.merchant_memberships (user_id);

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

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

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

-- Extend the existing organisation access/manage checks (defined in
-- 20260706103000_organisation_foundation.sql) to also honour the new
-- membership table. CREATE OR REPLACE keeps the function signature stable so
-- every RLS policy already using these two functions picks up the new
-- membership model automatically, with no policy changes required.
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
    FROM public.organisation_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organisation_id = target_organisation_id
      AND ou.status = 'active'
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
      AND lower(COALESCE(p.role, '')) IN ('company_admin', 'operations_admin', 'operations', 'super_admin', 'platform_admin', 'admin', 'owner')
  )
  OR EXISTS (
    SELECT 1
    FROM public.organisation_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organisation_id = target_organisation_id
      AND ou.status = 'active'
      AND lower(ou.role) IN ('company_admin', 'operations_admin', 'operations', 'super_admin')
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
  OR public.has_merchant_role(target_merchant_id, ARRAY['merchant_owner', 'merchant_admin', 'merchant_operator', 'merchant_viewer'])
  OR EXISTS (
    SELECT 1
    FROM public.merchants m
    WHERE m.id = target_merchant_id
      AND public.can_access_organisation(m.company_id)
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
      AND public.has_organisation_role(m.company_id, ARRAY['organisation_owner', 'organisation_admin'])
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: merchants
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchants_select ON public.merchants;
CREATE POLICY merchants_select
ON public.merchants
FOR SELECT
USING (public.can_access_organisation(company_id) OR public.can_access_merchant(id));

DROP POLICY IF EXISTS merchants_insert ON public.merchants;
CREATE POLICY merchants_insert
ON public.merchants
FOR INSERT
WITH CHECK (public.can_manage_organisation(company_id));

DROP POLICY IF EXISTS merchants_update ON public.merchants;
CREATE POLICY merchants_update
ON public.merchants
FOR UPDATE
USING (public.can_manage_organisation(company_id) OR public.can_manage_merchant(id))
WITH CHECK (public.can_manage_organisation(company_id) OR public.can_manage_merchant(id));

-- Intentionally no DELETE policy: merchants are archived (status column),
-- never hard-deleted, from normal application flows.

-- ---------------------------------------------------------------------------
-- RLS: organisation_memberships
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- RLS: merchant_memberships
-- ---------------------------------------------------------------------------

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

GRANT EXECUTE ON FUNCTION public.has_organisation_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_merchant_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_merchant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_merchant(UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.merchants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_memberships, public.merchant_memberships TO authenticated;
GRANT ALL ON public.merchants, public.organisation_memberships, public.merchant_memberships TO service_role;

NOTIFY pgrst, 'reload schema';
