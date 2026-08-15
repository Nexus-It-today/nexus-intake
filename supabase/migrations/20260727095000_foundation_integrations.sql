-- Sprint 1 Product Acceptance: Integration credentials.
--
-- Reuses the existing, generic `integration_providers` catalog (already
-- provider-agnostic - Xero/Stripe/WooCommerce/Track-POD/etc. are just seed
-- ROWS in that table, never hard-coded in application code) and introduces
-- an organisation-scoped connections table, parallel to the legacy
-- company-scoped `merchant_integration_connections`, so the new canonical
-- organisation model has its own credential storage without touching the
-- legacy table or its RLS.

CREATE TABLE IF NOT EXISTS public.organisation_integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES public.integration_providers(provider_key) ON DELETE RESTRICT,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  -- Encrypted with the existing src/lib/integrations/credentials.ts helper
  -- (AES-256-GCM). Never decrypted or returned in full by any API route -
  -- only credential_hint (e.g. a masked last-4) is ever surfaced.
  credentials_ciphertext TEXT,
  credentials_iv TEXT,
  credentials_tag TEXT,
  credential_hint TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::JSONB,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_organisation_integration_connections_org
ON public.organisation_integration_connections (organisation_id);

DROP TRIGGER IF EXISTS organisation_integration_connections_set_updated_at ON public.organisation_integration_connections;
CREATE TRIGGER organisation_integration_connections_set_updated_at
BEFORE UPDATE ON public.organisation_integration_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.organisation_integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_integration_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisation_integration_connections_select ON public.organisation_integration_connections;
CREATE POLICY organisation_integration_connections_select
ON public.organisation_integration_connections
FOR SELECT
USING (public.can_access_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_integration_connections_insert ON public.organisation_integration_connections;
CREATE POLICY organisation_integration_connections_insert
ON public.organisation_integration_connections
FOR INSERT
WITH CHECK (public.can_manage_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_integration_connections_update ON public.organisation_integration_connections;
CREATE POLICY organisation_integration_connections_update
ON public.organisation_integration_connections
FOR UPDATE
USING (public.can_manage_organisation(organisation_id))
WITH CHECK (public.can_manage_organisation(organisation_id));

DROP POLICY IF EXISTS organisation_integration_connections_delete ON public.organisation_integration_connections;
CREATE POLICY organisation_integration_connections_delete
ON public.organisation_integration_connections
FOR DELETE
USING (public.can_manage_organisation(organisation_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_integration_connections TO authenticated;
GRANT ALL ON public.organisation_integration_connections TO service_role;

NOTIFY pgrst, 'reload schema';
