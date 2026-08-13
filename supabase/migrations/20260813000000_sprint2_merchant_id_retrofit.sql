-- Sprint 2 "Retrofit it": add merchant_id to operational tables.
--
-- Phase A of the company_id → merchant_id migration:
--   1. Add nullable merchant_id FK to every operational table that still only
--      carries company_id as its tenancy key.
--   2. Backfill: for each row, set merchant_id only when exactly ONE merchant
--      exists for that company_id (HAVING COUNT(*) = 1).  Rows whose company
--      has zero or multiple merchants are left NULL intentionally — they remain
--      accessible via the company_id → can_access_organisation() RLS path
--      added in 20260813002000.
--   3. Add covering indexes.
--
-- company_id columns are NOT removed here; application code still reads them.
-- Phase B (Sprint 3) will migrate all code to merchant_id and then drop the
-- legacy columns.
--
-- Tables covered:
--   draft_jobs, merchant_customers, merchant_customer_invitations,
--   merchant_collection_profiles, merchant_integration_connections,
--   sales_channels, merchant_customer_booking_profiles, uploaded_documents
--
-- merchant_goods_catalogue already uses merchant_id as its primary tenancy
-- key and is therefore not included.

-- ---------------------------------------------------------------------------
-- draft_jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.draft_jobs
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.draft_jobs dj
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = dj.company_id
  HAVING COUNT(*) = 1
)
WHERE dj.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_draft_jobs_merchant_id ON public.draft_jobs (merchant_id);

-- ---------------------------------------------------------------------------
-- merchant_customers
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customers
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.merchant_customers mc
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = mc.company_id
  HAVING COUNT(*) = 1
)
WHERE mc.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_customers_merchant_id ON public.merchant_customers (merchant_id);

-- ---------------------------------------------------------------------------
-- merchant_customer_invitations
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customer_invitations
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.merchant_customer_invitations mci
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = mci.company_id
  HAVING COUNT(*) = 1
)
WHERE mci.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_customer_invitations_merchant_id ON public.merchant_customer_invitations (merchant_id);

-- ---------------------------------------------------------------------------
-- merchant_collection_profiles
-- (company_id had a UNIQUE constraint — merchant_id does not, since an org
--  may eventually have multiple merchants each with their own profile)
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_collection_profiles
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.merchant_collection_profiles mcp
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = mcp.company_id
  HAVING COUNT(*) = 1
)
WHERE mcp.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_collection_profiles_merchant_id ON public.merchant_collection_profiles (merchant_id);

-- ---------------------------------------------------------------------------
-- merchant_integration_connections
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_integration_connections
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.merchant_integration_connections mic
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = mic.company_id
  HAVING COUNT(*) = 1
)
WHERE mic.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_integration_connections_merchant_id ON public.merchant_integration_connections (merchant_id);

-- ---------------------------------------------------------------------------
-- sales_channels
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_channels
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.sales_channels sc
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = sc.company_id
  HAVING COUNT(*) = 1
)
WHERE sc.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_channels_merchant_id ON public.sales_channels (merchant_id);

-- ---------------------------------------------------------------------------
-- merchant_customer_booking_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_customer_booking_profiles
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.merchant_customer_booking_profiles mcbp
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = mcbp.company_id
  HAVING COUNT(*) = 1
)
WHERE mcbp.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_customer_booking_profiles_merchant_id ON public.merchant_customer_booking_profiles (merchant_id);

-- ---------------------------------------------------------------------------
-- uploaded_documents
-- ---------------------------------------------------------------------------

ALTER TABLE public.uploaded_documents
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;

UPDATE public.uploaded_documents ud
SET merchant_id = (
  SELECT MIN(m.id)
  FROM public.merchants m
  WHERE m.company_id = ud.company_id
  HAVING COUNT(*) = 1
)
WHERE ud.merchant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_documents_merchant_id ON public.uploaded_documents (merchant_id);

NOTIFY pgrst, 'reload schema';
