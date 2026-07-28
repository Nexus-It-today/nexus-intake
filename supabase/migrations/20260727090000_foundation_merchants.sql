-- Sprint 1 "Foundation it": canonical merchant entity.
--
-- Introduces `merchants` as a first-class child of `organisations`, per the
-- canonical hierarchy: Nexus it -> Customer organisation -> Merchant -> Users.
-- An organisation may own zero or more merchants. This table intentionally
-- does not touch any existing operational table (draft_jobs, catalogue, etc.)
-- - those continue to use company_id/organisation_id until a future sprint
-- migrates them onto merchant_id.

CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trading_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_organisation_id ON public.merchants (organisation_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON public.merchants (status);

DROP TRIGGER IF EXISTS merchants_set_updated_at ON public.merchants;
CREATE TRIGGER merchants_set_updated_at
BEFORE UPDATE ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- RLS is enabled in 20260727091000_foundation_memberships.sql once the
-- membership helper functions this table's policies depend on exist.

NOTIFY pgrst, 'reload schema';
