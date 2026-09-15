-- Restrict direct anonymous access to private legacy application tables.
-- Existing authenticated operational grants and server integrations remain intact.
-- Apply only to the legacy project; this is not a canonical production migration.
revoke all privileges on table
  public.customer_portal_users,
  public.discuss_it_timeline,
  public.document_extraction_templates,
  public.document_field_mappings,
  public.document_workflow_statuses,
  public.draft_job_schedule_overrides,
  public.draft_jobs,
  public.integration_providers,
  public.merchant_catalogue_items,
  public.merchant_collection_profiles,
  public.merchant_customer_addresses,
  public.merchant_customer_booking_profiles,
  public.merchant_customer_invitations,
  public.merchant_customers,
  public.merchant_goods_catalogue,
  public.merchant_integration_connections,
  public.merchant_price_it_commercial,
  public.notify_it_conversations,
  public.notify_it_messages,
  public.operations_notifications,
  public.platform_admin_bootstrap
from public, anon;

-- Bootstrap identities are managed by trusted server/database operators only.
revoke all privileges on table public.platform_admin_bootstrap from authenticated;
notify pgrst, 'reload schema';
