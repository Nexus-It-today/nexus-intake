-- Loss-proof intake foundation.
--
-- These tables deliberately separate receipt from processing. A source event is
-- committed before mapping, payment matching, or Track-POD delivery is tried.
-- Raw payloads and event history are append-only and service-role only because
-- they may contain customer PII.

CREATE TABLE IF NOT EXISTS public.order_ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_order_id TEXT,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  draft_job_id UUID REFERENCES public.draft_jobs(id) ON DELETE SET NULL,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, source_system, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_order_ingestion_events_unprocessed
  ON public.order_ingestion_events (processing_status, received_at)
  WHERE processing_status IN ('received', 'failed');
CREATE INDEX IF NOT EXISTS idx_order_ingestion_events_order
  ON public.order_ingestion_events (company_id, source_system, external_order_id);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'square')),
  provider_event_id TEXT NOT NULL,
  provider_payment_id TEXT,
  nexus_booking_reference TEXT,
  external_order_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor BIGINT,
  currency TEXT,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  draft_job_id UUID REFERENCES public.draft_jobs(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'mismatch', 'ignored')),
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  UNIQUE (company_id, provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_unmatched
  ON public.payment_events (company_id, provider, received_at)
  WHERE match_status IN ('unmatched', 'mismatch');

CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  draft_job_id UUID NOT NULL REFERENCES public.draft_jobs(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'retry', 'dead_letter', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (destination, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_ready
  ON public.integration_outbox (destination, available_at, created_at)
  WHERE status IN ('pending', 'retry');

CREATE TABLE IF NOT EXISTS public.reconciliation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  exception_key TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'urgent', 'critical')),
  source_system TEXT,
  external_order_id TEXT,
  draft_job_id UUID REFERENCES public.draft_jobs(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, exception_key)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_open
  ON public.reconciliation_exceptions (company_id, severity, first_detected_at)
  WHERE status IN ('open', 'investigating');

DROP TRIGGER IF EXISTS integration_outbox_set_updated_at ON public.integration_outbox;
CREATE TRIGGER integration_outbox_set_updated_at
BEFORE UPDATE ON public.integration_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS reconciliation_exceptions_set_updated_at ON public.reconciliation_exceptions;
CREATE TRIGGER reconciliation_exceptions_set_updated_at
BEFORE UPDATE ON public.reconciliation_exceptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.order_ingestion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_ingestion_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_exceptions FORCE ROW LEVEL SECURITY;

-- No browser role can read raw payloads or mutate processing state. Admin UI
-- access will be added through a redacted server-side endpoint.
REVOKE ALL ON public.order_ingestion_events FROM anon, authenticated;
REVOKE ALL ON public.payment_events FROM anon, authenticated;
REVOKE ALL ON public.integration_outbox FROM anon, authenticated;
REVOKE ALL ON public.reconciliation_exceptions FROM anon, authenticated;
GRANT ALL ON public.order_ingestion_events TO service_role;
GRANT ALL ON public.payment_events TO service_role;
GRANT ALL ON public.integration_outbox TO service_role;
GRANT ALL ON public.reconciliation_exceptions TO service_role;

NOTIFY pgrst, 'reload schema';
