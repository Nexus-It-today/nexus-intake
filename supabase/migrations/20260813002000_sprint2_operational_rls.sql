-- Sprint 2 "Retrofit it": enable RLS on all operational tables.
--
-- Applies the three-tier policy pattern to the eight operational tables that
-- gained merchant_id in 20260813000000_sprint2_merchant_id_retrofit.sql:
--
--   Tier 1 – Platform admin: is_platform_admin() → full SELECT/UPDATE.
--            INSERT/DELETE by platform admin requires the privilege to be
--            audited in application code (Route Handlers check canManage*
--            before writing via the privileged client).
--
--   Tier 2 – Organisation scope: any active/invited member of the owning
--            organisation can SELECT; manage roles (owner/admin) can INSERT/UPDATE.
--
--   Tier 3 – Merchant scope: any active/invited member of the owning merchant
--            can SELECT; manage roles (owner/admin/operator) can INSERT/UPDATE.
--
-- Backward compatibility: merchant_id may still be NULL for rows that could
-- not be backfilled (organisations with no merchant yet).  Those rows fall
-- through to the organisation scope check on company_id so existing access
-- is preserved during the transition period.  Once Sprint 3 completes the
-- code migration and backfill is verified, the company_id fallback can be
-- removed from the SELECT policy in a follow-up migration.
--
-- These policies use FORCE ROW LEVEL SECURITY so the service-role client
-- is NOT exempt — service-role queries inside Route Handlers must issue
-- explicit .rpc('bypass_rls_...') or use the admin API for bulk ops.
-- The privilegedClient in supabaseServer.ts is intentionally NOT given
-- a special bypass; it must pass permission checks like any other caller.

-- ---------------------------------------------------------------------------
-- Helper macro (inline): the standard three-tier USING clause
-- The same logic is repeated across tables; keeping it inline (rather than
-- wrapping in another SQL function) keeps each policy independently readable.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- draft_jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.draft_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS draft_jobs_select ON public.draft_jobs;
CREATE POLICY draft_jobs_select
ON public.draft_jobs
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS draft_jobs_insert ON public.draft_jobs;
CREATE POLICY draft_jobs_insert
ON public.draft_jobs
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS draft_jobs_update ON public.draft_jobs;
CREATE POLICY draft_jobs_update
ON public.draft_jobs
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- merchant_customers
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_customers_select ON public.merchant_customers;
CREATE POLICY merchant_customers_select
ON public.merchant_customers
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customers_insert ON public.merchant_customers;
CREATE POLICY merchant_customers_insert
ON public.merchant_customers
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customers_update ON public.merchant_customers;
CREATE POLICY merchant_customers_update
ON public.merchant_customers
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- merchant_customer_invitations
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_customer_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_customer_invitations_select ON public.merchant_customer_invitations;
CREATE POLICY merchant_customer_invitations_select
ON public.merchant_customer_invitations
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customer_invitations_insert ON public.merchant_customer_invitations;
CREATE POLICY merchant_customer_invitations_insert
ON public.merchant_customer_invitations
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customer_invitations_update ON public.merchant_customer_invitations;
CREATE POLICY merchant_customer_invitations_update
ON public.merchant_customer_invitations
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- merchant_collection_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_collection_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_collection_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_collection_profiles_select ON public.merchant_collection_profiles;
CREATE POLICY merchant_collection_profiles_select
ON public.merchant_collection_profiles
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_collection_profiles_insert ON public.merchant_collection_profiles;
CREATE POLICY merchant_collection_profiles_insert
ON public.merchant_collection_profiles
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_collection_profiles_update ON public.merchant_collection_profiles;
CREATE POLICY merchant_collection_profiles_update
ON public.merchant_collection_profiles
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- merchant_integration_connections
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_integration_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_integration_connections_select ON public.merchant_integration_connections;
CREATE POLICY merchant_integration_connections_select
ON public.merchant_integration_connections
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_integration_connections_insert ON public.merchant_integration_connections;
CREATE POLICY merchant_integration_connections_insert
ON public.merchant_integration_connections
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_integration_connections_update ON public.merchant_integration_connections;
CREATE POLICY merchant_integration_connections_update
ON public.merchant_integration_connections
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- sales_channels
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_channels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_channels_select ON public.sales_channels;
CREATE POLICY sales_channels_select
ON public.sales_channels
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS sales_channels_insert ON public.sales_channels;
CREATE POLICY sales_channels_insert
ON public.sales_channels
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS sales_channels_update ON public.sales_channels;
CREATE POLICY sales_channels_update
ON public.sales_channels
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- merchant_customer_booking_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customer_booking_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_customer_booking_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_customer_booking_profiles_select ON public.merchant_customer_booking_profiles;
CREATE POLICY merchant_customer_booking_profiles_select
ON public.merchant_customer_booking_profiles
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customer_booking_profiles_insert ON public.merchant_customer_booking_profiles;
CREATE POLICY merchant_customer_booking_profiles_insert
ON public.merchant_customer_booking_profiles
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS merchant_customer_booking_profiles_update ON public.merchant_customer_booking_profiles;
CREATE POLICY merchant_customer_booking_profiles_update
ON public.merchant_customer_booking_profiles
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- uploaded_documents
-- ---------------------------------------------------------------------------

ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uploaded_documents_select ON public.uploaded_documents;
CREATE POLICY uploaded_documents_select
ON public.uploaded_documents
FOR SELECT
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
  OR public.can_access_organisation(company_id)
);

DROP POLICY IF EXISTS uploaded_documents_insert ON public.uploaded_documents;
CREATE POLICY uploaded_documents_insert
ON public.uploaded_documents
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

DROP POLICY IF EXISTS uploaded_documents_update ON public.uploaded_documents;
CREATE POLICY uploaded_documents_update
ON public.uploaded_documents
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
  OR public.can_manage_organisation(company_id)
);

-- ---------------------------------------------------------------------------
-- Grants: authenticated role can use these tables; service_role is unaffected
-- by RLS but still needs explicit grants for PostgREST.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON
  public.draft_jobs,
  public.merchant_customers,
  public.merchant_customer_invitations,
  public.merchant_collection_profiles,
  public.merchant_integration_connections,
  public.sales_channels,
  public.merchant_customer_booking_profiles,
  public.uploaded_documents
TO authenticated;

GRANT ALL ON
  public.draft_jobs,
  public.merchant_customers,
  public.merchant_customer_invitations,
  public.merchant_collection_profiles,
  public.merchant_integration_connections,
  public.sales_channels,
  public.merchant_customer_booking_profiles,
  public.uploaded_documents
TO service_role;

NOTIFY pgrst, 'reload schema';
