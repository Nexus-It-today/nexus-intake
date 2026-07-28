-- Sprint 1 Product Acceptance: Commercial rules (module entitlements).
--
-- A generic module catalog (matching the "it" product principle - Create it,
-- Brand it, Book it, Catalogue it, etc.) plus organisation- and
-- merchant-level entitlement overrides. No customer name, and no specific
-- future integration, is hard-coded - only the module concept itself.
-- Billing/usage metering is explicitly NOT implemented here (per brief);
-- usage_limit is recorded as a plain allowance number for future billing
-- work to read.

CREATE TABLE IF NOT EXISTS public.platform_modules (
  module_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organisation_module_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual_grant' CHECK (source IN ('platform_default', 'manual_grant')),
  usage_limit INT,
  notes TEXT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.merchant_module_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  usage_limit INT,
  notes TEXT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_organisation_module_entitlements_org ON public.organisation_module_entitlements (organisation_id);
CREATE INDEX IF NOT EXISTS idx_merchant_module_entitlements_merchant ON public.merchant_module_entitlements (merchant_id);

DROP TRIGGER IF EXISTS organisation_module_entitlements_set_updated_at ON public.organisation_module_entitlements;
CREATE TRIGGER organisation_module_entitlements_set_updated_at
BEFORE UPDATE ON public.organisation_module_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS merchant_module_entitlements_set_updated_at ON public.merchant_module_entitlements;
CREATE TRIGGER merchant_module_entitlements_set_updated_at
BEFORE UPDATE ON public.merchant_module_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

INSERT INTO public.platform_modules (module_key, name, description, sort_order, is_default_enabled)
VALUES
  ('foundation_it', 'Foundation it', 'Organisations, merchants, users, branding, audit - always on.', 0, TRUE),
  ('create_it', 'Create it', 'Organisation and merchant creation workflows.', 1, TRUE),
  ('brand_it', 'Brand it', 'Branding and identity management.', 2, TRUE),
  ('book_it', 'Book it', 'Hosted booking forms and intake.', 10, FALSE),
  ('catalogue_it', 'Catalogue it', 'Merchant goods and pricing catalogue.', 11, FALSE),
  ('track_it', 'Track it', 'Shipment and delivery tracking.', 12, FALSE),
  ('invoice_it', 'Invoice it', 'Invoicing and billing documents.', 13, FALSE),
  ('report_it', 'Report it', 'Operational and commercial reporting.', 14, FALSE),
  ('integrate_it', 'Integrate it', 'Third-party integration credentials and connectors.', 20, TRUE)
ON CONFLICT (module_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_default_enabled = EXCLUDED.is_default_enabled;

ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_module_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_modules_select ON public.platform_modules;
CREATE POLICY platform_modules_select
ON public.platform_modules
FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS platform_modules_manage ON public.platform_modules;
CREATE POLICY platform_modules_manage
ON public.platform_modules
FOR ALL
USING (public.current_user_is_super_admin())
WITH CHECK (public.current_user_is_super_admin());

DROP POLICY IF EXISTS organisation_module_entitlements_select ON public.organisation_module_entitlements;
CREATE POLICY organisation_module_entitlements_select
ON public.organisation_module_entitlements
FOR SELECT
USING (public.can_access_organisation(organisation_id));

-- Only Nexus platform admins set organisation-level entitlements.
DROP POLICY IF EXISTS organisation_module_entitlements_manage ON public.organisation_module_entitlements;
CREATE POLICY organisation_module_entitlements_manage
ON public.organisation_module_entitlements
FOR ALL
USING (public.current_user_is_super_admin())
WITH CHECK (public.current_user_is_super_admin());

DROP POLICY IF EXISTS merchant_module_entitlements_select ON public.merchant_module_entitlements;
CREATE POLICY merchant_module_entitlements_select
ON public.merchant_module_entitlements
FOR SELECT
USING (public.can_access_merchant(merchant_id));

-- Platform admins, or the merchant's own organisation admin/owner, may set
-- merchant-level entitlements (application code additionally enforces that
-- this can only ever narrow, never exceed, the parent organisation's own
-- entitlement for that module - see src/lib/platform/commercial.ts).
DROP POLICY IF EXISTS merchant_module_entitlements_manage ON public.merchant_module_entitlements;
CREATE POLICY merchant_module_entitlements_manage
ON public.merchant_module_entitlements
FOR ALL
USING (
  public.current_user_is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = merchant_id AND public.has_organisation_role(m.organisation_id, ARRAY['organisation_owner', 'organisation_admin'])
  )
)
WITH CHECK (
  public.current_user_is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = merchant_id AND public.has_organisation_role(m.organisation_id, ARRAY['organisation_owner', 'organisation_admin'])
  )
);

GRANT SELECT ON public.platform_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_module_entitlements, public.merchant_module_entitlements TO authenticated;
GRANT ALL ON public.platform_modules, public.organisation_module_entitlements, public.merchant_module_entitlements TO service_role;

NOTIFY pgrst, 'reload schema';
