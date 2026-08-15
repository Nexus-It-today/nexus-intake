-- Sprint 1 "Foundation it": Audit it.
--
-- audit_events is the canonical, append-only audit trail for the new
-- foundation (organisations, merchants, memberships, branding, context
-- switching). It is intentionally separate from the pre-existing
-- public.audit_log table (manage_it_permissions.sql), which stays as the
-- legacy Manage It admin-action log and is out of scope for this sprint.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  source TEXT NOT NULL DEFAULT 'app',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_organisation ON public.audit_events (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_merchant ON public.audit_events (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events (action);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select
ON public.audit_events
FOR SELECT
USING (
  public.current_user_is_super_admin()
  OR (organisation_id IS NOT NULL AND public.can_access_organisation(organisation_id))
  OR (merchant_id IS NOT NULL AND public.can_access_merchant(merchant_id))
);

-- No INSERT/UPDATE/DELETE policy for the `authenticated` role: rows are only
-- ever written via log_audit_event() (SECURITY DEFINER) or the service-role
-- client used by API routes, and are never editable once written.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  action_name TEXT,
  entity_type_name TEXT,
  entity_id_value TEXT DEFAULT NULL,
  target_organisation_id UUID DEFAULT NULL,
  target_merchant_id UUID DEFAULT NULL,
  metadata_payload JSONB DEFAULT '{}'::JSONB,
  source_name TEXT DEFAULT 'app'
)
RETURNS public.audit_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_row public.audit_events;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.audit_events (
    actor_user_id, organisation_id, merchant_id, action, entity_type, entity_id, metadata, source
  )
  VALUES (
    auth.uid(),
    target_organisation_id,
    target_merchant_id,
    action_name,
    entity_type_name,
    entity_id_value,
    COALESCE(metadata_payload, '{}'::JSONB),
    COALESCE(source_name, 'app')
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

NOTIFY pgrst, 'reload schema';
