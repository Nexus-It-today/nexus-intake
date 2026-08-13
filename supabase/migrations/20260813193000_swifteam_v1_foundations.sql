-- Swifteam V1 foundations: communication identities, immutable usage ledger,
-- and merchant allowance plans.

CREATE TABLE IF NOT EXISTS public.swifteam_channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'phone', 'whatsapp')),
  identity_value TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, channel, identity_value)
);

CREATE INDEX IF NOT EXISTS idx_swifteam_channel_identities_merchant_id
  ON public.swifteam_channel_identities(merchant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_swifteam_channel_identities_global_unique
  ON public.swifteam_channel_identities(channel, identity_value)
  WHERE merchant_id IS NULL;

DROP TRIGGER IF EXISTS swifteam_channel_identities_set_updated_at ON public.swifteam_channel_identities;
CREATE TRIGGER swifteam_channel_identities_set_updated_at
BEFORE UPDATE ON public.swifteam_channel_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_email TEXT NOT NULL,
  actor_mode TEXT NOT NULL,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  module_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  channel TEXT,
  channel_identity TEXT,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1,
  duration_seconds INTEGER,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity >= 0),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_merchant_occurred
  ON public.usage_events(merchant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_actor_occurred
  ON public.usage_events(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_action_occurred
  ON public.usage_events(action_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_usage_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'usage_events ledger is immutable';
END;
$$;

DROP TRIGGER IF EXISTS usage_events_prevent_update ON public.usage_events;
CREATE TRIGGER usage_events_prevent_update
BEFORE UPDATE ON public.usage_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_usage_events_mutation();

DROP TRIGGER IF EXISTS usage_events_prevent_delete ON public.usage_events;
CREATE TRIGGER usage_events_prevent_delete
BEFORE DELETE ON public.usage_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_usage_events_mutation();

CREATE TABLE IF NOT EXISTS public.merchant_usage_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  email_allowance INTEGER NOT NULL CHECK (email_allowance >= 0),
  call_minutes_allowance INTEGER NOT NULL CHECK (call_minutes_allowance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (merchant_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_merchant_usage_plans_merchant_period
  ON public.merchant_usage_plans(merchant_id, period_start DESC, period_end DESC);

DROP TRIGGER IF EXISTS merchant_usage_plans_set_updated_at ON public.merchant_usage_plans;
CREATE TRIGGER merchant_usage_plans_set_updated_at
BEFORE UPDATE ON public.merchant_usage_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.swifteam_channel_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swifteam_channel_identities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swifteam_channel_identities_select ON public.swifteam_channel_identities;
CREATE POLICY swifteam_channel_identities_select
ON public.swifteam_channel_identities
FOR SELECT
USING (
  public.is_platform_admin()
  OR merchant_id IS NULL
  OR public.can_access_merchant(merchant_id)
);

DROP POLICY IF EXISTS swifteam_channel_identities_insert ON public.swifteam_channel_identities;
CREATE POLICY swifteam_channel_identities_insert
ON public.swifteam_channel_identities
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
);

DROP POLICY IF EXISTS swifteam_channel_identities_update ON public.swifteam_channel_identities;
CREATE POLICY swifteam_channel_identities_update
ON public.swifteam_channel_identities
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
)
WITH CHECK (
  public.is_platform_admin()
  OR (merchant_id IS NOT NULL AND public.can_manage_merchant(merchant_id))
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_select ON public.usage_events;
CREATE POLICY usage_events_select
ON public.usage_events
FOR SELECT
USING (
  public.is_platform_admin()
  OR public.can_access_merchant(merchant_id)
);

DROP POLICY IF EXISTS usage_events_insert ON public.usage_events;
CREATE POLICY usage_events_insert
ON public.usage_events
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR public.can_access_merchant(merchant_id)
);

ALTER TABLE public.merchant_usage_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_usage_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_usage_plans_select ON public.merchant_usage_plans;
CREATE POLICY merchant_usage_plans_select
ON public.merchant_usage_plans
FOR SELECT
USING (
  public.is_platform_admin()
  OR public.can_access_merchant(merchant_id)
);

DROP POLICY IF EXISTS merchant_usage_plans_insert ON public.merchant_usage_plans;
CREATE POLICY merchant_usage_plans_insert
ON public.merchant_usage_plans
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR public.can_manage_merchant(merchant_id)
);

DROP POLICY IF EXISTS merchant_usage_plans_update ON public.merchant_usage_plans;
CREATE POLICY merchant_usage_plans_update
ON public.merchant_usage_plans
FOR UPDATE
USING (
  public.is_platform_admin()
  OR public.can_manage_merchant(merchant_id)
)
WITH CHECK (
  public.is_platform_admin()
  OR public.can_manage_merchant(merchant_id)
);

GRANT SELECT, INSERT, UPDATE ON
  public.swifteam_channel_identities,
  public.usage_events,
  public.merchant_usage_plans
TO authenticated;

GRANT ALL ON
  public.swifteam_channel_identities,
  public.usage_events,
  public.merchant_usage_plans
TO service_role;

INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
JOIN public.roles r ON r.slug = 'nexus_super_admin'
WHERE lower(COALESCE(u.email, '')) = lower('swift@nexus.delivery')
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.swifteam_channel_identities (merchant_id, channel, identity_value, label, is_active)
SELECT NULL, 'email', 'swift@nexus.delivery', 'Swifteam master email', TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.swifteam_channel_identities
  WHERE merchant_id IS NULL
    AND channel = 'email'
    AND identity_value = 'swift@nexus.delivery'
);

INSERT INTO public.swifteam_channel_identities (merchant_id, channel, identity_value, label, is_active)
SELECT NULL, 'phone', '0113 479 0208', 'Swifteam CircleLoop', TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.swifteam_channel_identities
  WHERE merchant_id IS NULL
    AND channel = 'phone'
    AND identity_value = '0113 479 0208'
);

INSERT INTO public.merchant_usage_plans (
  merchant_id,
  plan_key,
  period_start,
  period_end,
  email_allowance,
  call_minutes_allowance
)
SELECT
  m.id,
  'swifteam_test_plan_v1',
  date_trunc('month', NOW())::date,
  (date_trunc('month', NOW()) + interval '1 month - 1 day')::date,
  200,
  200
FROM public.merchants m
WHERE lower(m.name) = lower('Nexus Delivery Solutions')
ON CONFLICT (merchant_id, period_start, period_end) DO NOTHING;

NOTIFY pgrst, 'reload schema';
