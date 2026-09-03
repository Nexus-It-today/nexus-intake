-- Atomic outbox claiming and automatic accounting dispatch.

CREATE OR REPLACE FUNCTION public.claim_integration_outbox(
  worker_destination TEXT,
  batch_size INTEGER DEFAULT 10
)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.integration_outbox
    WHERE destination = worker_destination
      AND status IN ('pending', 'retry')
      AND available_at <= NOW()
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(batch_size, 1), 50)
  )
  UPDATE public.integration_outbox AS outbox
  SET status = 'processing',
      locked_at = NOW(),
      attempt_count = outbox.attempt_count + 1,
      updated_at = NOW()
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_integration_outbox(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_required_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_required IS TRUE
     AND NEW.xero_draft_invoice_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.invoice_required IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.integration_outbox (
      company_id, draft_job_id, destination, operation, idempotency_key, payload
    ) VALUES (
      NEW.company_id, NEW.id, 'accounting', 'create_draft_invoice',
      NEW.company_id::TEXT || ':' || NEW.id::TEXT || ':draft-invoice',
      jsonb_build_object('draftJobId', NEW.id, 'companyId', NEW.company_id)
    )
    ON CONFLICT (destination, operation, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_jobs_enqueue_required_invoice ON public.draft_jobs;
CREATE TRIGGER draft_jobs_enqueue_required_invoice
AFTER INSERT OR UPDATE OF invoice_required ON public.draft_jobs
FOR EACH ROW EXECUTE FUNCTION public.enqueue_required_invoice();

NOTIFY pgrst, 'reload schema';
