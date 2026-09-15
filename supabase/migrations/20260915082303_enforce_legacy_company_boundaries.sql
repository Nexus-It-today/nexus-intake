-- Complete the legacy company boundary without applying unrelated foundation migrations.
-- Authority assignment and encrypted integration material belong to trusted server routes.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, email, updated_at) on public.profiles to authenticated;
revoke insert, update, delete on public.organisation_users from authenticated;
revoke all privileges on public.merchant_integration_connections from authenticated;

alter table public.customer_portal_users enable row level security;
create policy commissioning_company_select on public.customer_portal_users for select to authenticated using (public.can_access_organisation(customer_portal_users.company_id));
create policy commissioning_company_insert on public.customer_portal_users for insert to authenticated with check (public.can_manage_organisation(customer_portal_users.company_id));
create policy commissioning_company_update on public.customer_portal_users for update to authenticated using (public.can_manage_organisation(customer_portal_users.company_id)) with check (public.can_manage_organisation(customer_portal_users.company_id));

alter table public.discuss_it_timeline enable row level security;
create policy commissioning_company_select on public.discuss_it_timeline for select to authenticated using (public.can_access_organisation(discuss_it_timeline.company_id));
create policy commissioning_company_insert on public.discuss_it_timeline for insert to authenticated with check (public.can_manage_organisation(discuss_it_timeline.company_id));
create policy commissioning_company_update on public.discuss_it_timeline for update to authenticated using (public.can_manage_organisation(discuss_it_timeline.company_id)) with check (public.can_manage_organisation(discuss_it_timeline.company_id));

alter table public.document_extraction_templates enable row level security;
create policy commissioning_company_select on public.document_extraction_templates for select to authenticated using (public.can_access_organisation(document_extraction_templates.company_id));
create policy commissioning_company_insert on public.document_extraction_templates for insert to authenticated with check (public.can_manage_organisation(document_extraction_templates.company_id));
create policy commissioning_company_update on public.document_extraction_templates for update to authenticated using (public.can_manage_organisation(document_extraction_templates.company_id)) with check (public.can_manage_organisation(document_extraction_templates.company_id));

alter table public.document_field_mappings enable row level security;
create policy commissioning_company_select on public.document_field_mappings for select to authenticated using (exists (select 1 from public.document_extraction_templates scoped where scoped.id = document_field_mappings.template_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.document_field_mappings for insert to authenticated with check (exists (select 1 from public.document_extraction_templates scoped where scoped.id = document_field_mappings.template_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.document_field_mappings for update to authenticated using (exists (select 1 from public.document_extraction_templates scoped where scoped.id = document_field_mappings.template_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.document_extraction_templates scoped where scoped.id = document_field_mappings.template_id and public.can_manage_organisation(scoped.company_id)));

alter table public.document_workflow_statuses enable row level security;
create policy commissioning_company_select on public.document_workflow_statuses for select to authenticated using (true);

alter table public.draft_job_schedule_overrides enable row level security;
create policy commissioning_company_select on public.draft_job_schedule_overrides for select to authenticated using (exists (select 1 from public.draft_jobs scoped where scoped.id = draft_job_schedule_overrides.draft_job_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.draft_job_schedule_overrides for insert to authenticated with check (exists (select 1 from public.draft_jobs scoped where scoped.id = draft_job_schedule_overrides.draft_job_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.draft_job_schedule_overrides for update to authenticated using (exists (select 1 from public.draft_jobs scoped where scoped.id = draft_job_schedule_overrides.draft_job_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.draft_jobs scoped where scoped.id = draft_job_schedule_overrides.draft_job_id and public.can_manage_organisation(scoped.company_id)));

alter table public.draft_jobs enable row level security;
create policy commissioning_company_select on public.draft_jobs for select to authenticated using (public.can_access_organisation(draft_jobs.company_id));
create policy commissioning_company_insert on public.draft_jobs for insert to authenticated with check (public.can_manage_organisation(draft_jobs.company_id));
create policy commissioning_company_update on public.draft_jobs for update to authenticated using (public.can_manage_organisation(draft_jobs.company_id)) with check (public.can_manage_organisation(draft_jobs.company_id));

alter table public.integration_providers enable row level security;
create policy commissioning_company_select on public.integration_providers for select to authenticated using (true);

alter table public.merchant_catalogue_items enable row level security;
create policy commissioning_company_select on public.merchant_catalogue_items for select to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_catalogue_items.merchant_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.merchant_catalogue_items for insert to authenticated with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_catalogue_items.merchant_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.merchant_catalogue_items for update to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_catalogue_items.merchant_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_catalogue_items.merchant_id and public.can_manage_organisation(scoped.company_id)));

alter table public.merchant_collection_profiles enable row level security;
create policy commissioning_company_select on public.merchant_collection_profiles for select to authenticated using (public.can_access_organisation(merchant_collection_profiles.company_id));
create policy commissioning_company_insert on public.merchant_collection_profiles for insert to authenticated with check (public.can_manage_organisation(merchant_collection_profiles.company_id));
create policy commissioning_company_update on public.merchant_collection_profiles for update to authenticated using (public.can_manage_organisation(merchant_collection_profiles.company_id)) with check (public.can_manage_organisation(merchant_collection_profiles.company_id));

alter table public.merchant_customer_addresses enable row level security;
create policy commissioning_company_select on public.merchant_customer_addresses for select to authenticated using (public.can_access_organisation(merchant_customer_addresses.company_id));
create policy commissioning_company_insert on public.merchant_customer_addresses for insert to authenticated with check (public.can_manage_organisation(merchant_customer_addresses.company_id));
create policy commissioning_company_update on public.merchant_customer_addresses for update to authenticated using (public.can_manage_organisation(merchant_customer_addresses.company_id)) with check (public.can_manage_organisation(merchant_customer_addresses.company_id));

alter table public.merchant_customer_booking_profiles enable row level security;
create policy commissioning_company_select on public.merchant_customer_booking_profiles for select to authenticated using (public.can_access_organisation(merchant_customer_booking_profiles.company_id));
create policy commissioning_company_insert on public.merchant_customer_booking_profiles for insert to authenticated with check (public.can_manage_organisation(merchant_customer_booking_profiles.company_id));
create policy commissioning_company_update on public.merchant_customer_booking_profiles for update to authenticated using (public.can_manage_organisation(merchant_customer_booking_profiles.company_id)) with check (public.can_manage_organisation(merchant_customer_booking_profiles.company_id));

alter table public.merchant_customer_invitations enable row level security;
create policy commissioning_company_select on public.merchant_customer_invitations for select to authenticated using (public.can_access_organisation(merchant_customer_invitations.company_id));
create policy commissioning_company_insert on public.merchant_customer_invitations for insert to authenticated with check (public.can_manage_organisation(merchant_customer_invitations.company_id));
create policy commissioning_company_update on public.merchant_customer_invitations for update to authenticated using (public.can_manage_organisation(merchant_customer_invitations.company_id)) with check (public.can_manage_organisation(merchant_customer_invitations.company_id));

alter table public.merchant_customers enable row level security;
create policy commissioning_company_select on public.merchant_customers for select to authenticated using (public.can_access_organisation(merchant_customers.company_id));
create policy commissioning_company_insert on public.merchant_customers for insert to authenticated with check (public.can_manage_organisation(merchant_customers.company_id));
create policy commissioning_company_update on public.merchant_customers for update to authenticated using (public.can_manage_organisation(merchant_customers.company_id)) with check (public.can_manage_organisation(merchant_customers.company_id));

alter table public.merchant_goods_catalogue enable row level security;
create policy commissioning_company_select on public.merchant_goods_catalogue for select to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_goods_catalogue.merchant_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.merchant_goods_catalogue for insert to authenticated with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_goods_catalogue.merchant_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.merchant_goods_catalogue for update to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_goods_catalogue.merchant_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_goods_catalogue.merchant_id and public.can_manage_organisation(scoped.company_id)));

alter table public.merchant_integration_connections enable row level security;
-- Intentionally no browser policies: trusted server access only.

alter table public.merchant_price_it_commercial enable row level security;
create policy commissioning_company_select on public.merchant_price_it_commercial for select to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_price_it_commercial.merchant_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.merchant_price_it_commercial for insert to authenticated with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_price_it_commercial.merchant_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.merchant_price_it_commercial for update to authenticated using (exists (select 1 from public.merchants scoped where scoped.id = merchant_price_it_commercial.merchant_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.merchants scoped where scoped.id = merchant_price_it_commercial.merchant_id and public.can_manage_organisation(scoped.company_id)));

alter table public.notify_it_conversations enable row level security;
create policy commissioning_company_select on public.notify_it_conversations for select to authenticated using (public.can_access_organisation(notify_it_conversations.company_id));
create policy commissioning_company_insert on public.notify_it_conversations for insert to authenticated with check (public.can_manage_organisation(notify_it_conversations.company_id));
create policy commissioning_company_update on public.notify_it_conversations for update to authenticated using (public.can_manage_organisation(notify_it_conversations.company_id)) with check (public.can_manage_organisation(notify_it_conversations.company_id));

alter table public.notify_it_messages enable row level security;
create policy commissioning_company_select on public.notify_it_messages for select to authenticated using (exists (select 1 from public.notify_it_conversations scoped where scoped.id = notify_it_messages.conversation_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.notify_it_messages for insert to authenticated with check (exists (select 1 from public.notify_it_conversations scoped where scoped.id = notify_it_messages.conversation_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.notify_it_messages for update to authenticated using (exists (select 1 from public.notify_it_conversations scoped where scoped.id = notify_it_messages.conversation_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.notify_it_conversations scoped where scoped.id = notify_it_messages.conversation_id and public.can_manage_organisation(scoped.company_id)));

alter table public.operations_notifications enable row level security;
create policy commissioning_company_select on public.operations_notifications for select to authenticated using (exists (select 1 from public.draft_jobs scoped where scoped.id = operations_notifications.draft_job_id and public.can_access_organisation(scoped.company_id)));
create policy commissioning_company_insert on public.operations_notifications for insert to authenticated with check (exists (select 1 from public.draft_jobs scoped where scoped.id = operations_notifications.draft_job_id and public.can_manage_organisation(scoped.company_id)));
create policy commissioning_company_update on public.operations_notifications for update to authenticated using (exists (select 1 from public.draft_jobs scoped where scoped.id = operations_notifications.draft_job_id and public.can_manage_organisation(scoped.company_id))) with check (exists (select 1 from public.draft_jobs scoped where scoped.id = operations_notifications.draft_job_id and public.can_manage_organisation(scoped.company_id)));

alter table public.platform_admin_bootstrap enable row level security;
-- Intentionally no browser policies: trusted server access only.

-- Replace permissive company/customer policies with the already-established scope helpers.
alter policy companies_select_own_or_super on public.companies to authenticated using (public.can_access_organisation(id));
alter policy companies_authenticated_update on public.companies to authenticated using (public.can_manage_organisation(id)) with check (public.can_manage_organisation(id));
alter policy companies_authenticated_insert on public.companies to authenticated with check (public.current_user_is_super_admin());
alter policy customers_all_by_company on public.customers to authenticated using (public.can_access_organisation(company_id)) with check (public.can_manage_organisation(company_id));
alter policy "Users can insert own customer record" on public.customers to authenticated with check (auth.uid() = user_id and (company_id is null or public.can_access_organisation(company_id)));
alter policy "Users can update own customer record" on public.customers to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and (company_id is null or public.can_access_organisation(company_id)));
notify pgrst, 'reload schema';
