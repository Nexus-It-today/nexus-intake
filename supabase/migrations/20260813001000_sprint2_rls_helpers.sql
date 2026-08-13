-- Sprint 2 "Retrofit it": additional RLS helper functions.
--
-- Adds:
--   get_active_organisation_ids() — returns every organisation_id the current
--     user has an active/invited membership in; used in cross-org list queries
--     so callers don't have to join membership tables themselves.
--   get_active_merchant_ids() — same for merchant_memberships.
--   is_platform_admin() — no-arg wrapper around is_platform_admin(UUID) so
--     RLS policy bodies can call it without passing auth.uid() explicitly.
--
-- The existing is_platform_admin(UUID), has_organisation_role(UUID, TEXT[]),
-- has_merchant_role(UUID, TEXT[]), can_access_organisation(UUID), and
-- can_access_merchant(UUID) helpers remain unchanged and are still the
-- primary enforcement points in the new RLS policies.

-- ---------------------------------------------------------------------------
-- is_platform_admin() — no-argument form for RLS USING / WITH CHECK clauses
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_active_organisation_ids()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_organisation_ids()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id
  FROM public.organisation_memberships
  WHERE user_id = auth.uid()
    AND status IN ('active', 'invited');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_organisation_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_active_merchant_ids()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_merchant_ids()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT merchant_id
  FROM public.merchant_memberships
  WHERE user_id = auth.uid()
    AND status IN ('active', 'invited');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_merchant_ids() TO authenticated;

NOTIFY pgrst, 'reload schema';
