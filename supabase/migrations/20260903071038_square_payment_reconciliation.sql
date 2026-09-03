INSERT INTO public.integration_providers
  (provider_key, category, display_name, capabilities, sort_order, is_active)
VALUES
  ('square', 'payments', 'Square', ARRAY['payment_collection'], 15, TRUE),
  ('nexus_forms', 'commerce', 'Nexus Website Forms', ARRAY['order_ingest'], 5, TRUE)
ON CONFLICT (provider_key) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  capabilities = EXCLUDED.capabilities,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_payment_events_provider_payment
  ON public.payment_events (company_id, provider, provider_payment_id);

NOTIFY pgrst, 'reload schema';
