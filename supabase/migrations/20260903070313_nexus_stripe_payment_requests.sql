-- Nexus-owned payment links. The request is committed before Stripe is called,
-- and the webhook event is committed before any downstream release is queued.
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  draft_job_id UUID NOT NULL REFERENCES public.draft_jobs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe', 'square')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'gbp',
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'pending', 'paid', 'expired', 'cancelled', 'failed')),
  idempotency_key TEXT NOT NULL,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  checkout_url TEXT,
  customer_email TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  last_error TEXT,
  created_by_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, idempotency_key),
  UNIQUE (company_id, provider, checkout_session_id)
);

ALTER TABLE public.draft_jobs
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_requests_job
  ON public.payment_requests (company_id, draft_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_pending
  ON public.payment_requests (provider, status, created_at)
  WHERE status IN ('creating', 'pending');

DROP TRIGGER IF EXISTS payment_requests_set_updated_at ON public.payment_requests;
CREATE TRIGGER payment_requests_set_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_requests FROM anon, authenticated;
GRANT ALL ON public.payment_requests TO service_role;

NOTIFY pgrst, 'reload schema';
