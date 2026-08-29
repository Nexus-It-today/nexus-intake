-- Recovered verbatim from the live Nexusit_today Supabase migration history.
-- Production version: 20260829081208 / harden_track_it_capture_table_grants

-- Capture writes are exclusively performed by the authenticated, internally
-- authorized SECURITY DEFINER RPC. Browser-facing roles remain read-only.
revoke insert, update, delete, truncate, references, trigger
on table
  public.track_it_capture_runs,
  public.track_it_logical_orders,
  public.track_it_order_legs,
  public.track_it_capture_exceptions,
  public.track_it_acknowledgement_outbox
from public, anon, authenticated;
