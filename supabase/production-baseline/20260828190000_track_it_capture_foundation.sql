-- Nexusit_today - Track It capture and held acknowledgement foundation
-- Created 2026-08-28.
--
-- Capture only: this migration stores Track-POD order-date captures and held
-- acknowledgement previews. It does not send email, schedule work, configure
-- webhooks, or store provider credentials.

create unique index if not exists integration_connections_id_company_unique
  on public.integration_connections (id, company_id);

create type public.track_it_capture_run_status as enum ('STARTED', 'COMPLETED', 'FAILED');

create type public.track_it_exception_status as enum ('OPEN', 'RESOLVED');

create type public.track_it_acknowledgement_status as enum ('HELD', 'CANCELLED');

create table public.track_it_capture_runs (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id) on delete cascade,
  merchant_id                uuid,
  integration_connection_id  uuid not null,
  provider_key               text not null default 'track-pod',
  capture_kind               text not null default 'order_date',
  requested_start_date       date not null,
  requested_end_date         date not null,
  status                     public.track_it_capture_run_status not null default 'STARTED',
  order_dates_requested      date[] not null default '{}',
  records_seen               integer not null default 0,
  logical_orders_seen        integer not null default 0,
  legs_upserted              integer not null default 0,
  held_acknowledgements      integer not null default 0,
  error_summary              text,
  created_by                 uuid references public.profiles (id) on delete set null,
  started_at                 timestamptz not null default now(),
  completed_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint track_it_capture_runs_provider_check check (provider_key = 'track-pod'),
  constraint track_it_capture_runs_kind_check check (capture_kind = 'order_date'),
  constraint track_it_capture_runs_date_order check (requested_end_date >= requested_start_date),
  constraint track_it_capture_runs_nonnegative check (records_seen >= 0 and logical_orders_seen >= 0 and legs_upserted >= 0 and held_acknowledgements >= 0),
  constraint track_it_capture_runs_connection_fk
    foreign key (integration_connection_id, company_id)
    references public.integration_connections (id, company_id) on delete restrict,
  constraint track_it_capture_runs_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete restrict
);

create index track_it_capture_runs_company_time_idx
  on public.track_it_capture_runs (company_id, started_at desc);

create table public.track_it_logical_orders (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id) on delete cascade,
  merchant_id                uuid,
  integration_connection_id  uuid not null,
  provider_key               text not null default 'track-pod',
  logical_order_reference    text not null,
  first_order_date           date,
  last_order_date            date,
  first_seen_at              timestamptz not null default now(),
  last_seen_at               timestamptz not null default now(),
  acknowledgement_held       boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint track_it_logical_orders_reference_nonblank check (length(btrim(logical_order_reference)) > 0),
  constraint track_it_logical_orders_provider_check check (provider_key = 'track-pod'),
  constraint track_it_logical_orders_connection_fk
    foreign key (integration_connection_id, company_id)
    references public.integration_connections (id, company_id) on delete restrict,
  constraint track_it_logical_orders_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete restrict,
  constraint track_it_logical_orders_id_company_unique unique (id, company_id),
  constraint track_it_logical_orders_unique
    unique (company_id, integration_connection_id, logical_order_reference)
);

create index track_it_logical_orders_company_time_idx
  on public.track_it_logical_orders (company_id, last_seen_at desc);

create table public.track_it_order_legs (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null,
  merchant_id                uuid,
  logical_order_id           uuid not null,
  integration_connection_id  uuid not null,
  provider_key               text not null default 'track-pod',
  provider_order_id          text,
  track_id                   text not null,
  journey_leg                text not null,
  order_date                 date,
  status                     text,
  track_link                 text,
  contact_name               text,
  recipient_email_count      integer not null default 0,
  first_seen_at              timestamptz not null default now(),
  last_seen_at               timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint track_it_order_legs_provider_check check (provider_key = 'track-pod'),
  constraint track_it_order_legs_track_id_nonblank check (length(btrim(track_id)) > 0),
  constraint track_it_order_legs_journey_leg_check check (journey_leg in ('COLLECTION', 'DELIVERY')),
  constraint track_it_order_legs_email_count_nonnegative check (recipient_email_count >= 0),
  constraint track_it_order_legs_logical_order_fk
    foreign key (logical_order_id, company_id)
    references public.track_it_logical_orders (id, company_id) on delete cascade,
  constraint track_it_order_legs_connection_fk
    foreign key (integration_connection_id, company_id)
    references public.integration_connections (id, company_id) on delete restrict,
  constraint track_it_order_legs_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete restrict,
  constraint track_it_order_legs_unique_track_id
    unique (company_id, integration_connection_id, track_id)
);

create index track_it_order_legs_logical_order_idx
  on public.track_it_order_legs (company_id, logical_order_id);

create table public.track_it_capture_exceptions (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id) on delete cascade,
  merchant_id                uuid,
  integration_connection_id  uuid not null,
  capture_run_id             uuid,
  logical_order_id           uuid,
  provider_key               text not null default 'track-pod',
  exception_type             text not null,
  safe_summary               text not null,
  status                     public.track_it_exception_status not null default 'OPEN',
  created_at                 timestamptz not null default now(),
  resolved_at                timestamptz,
  constraint track_it_capture_exceptions_provider_check check (provider_key = 'track-pod'),
  constraint track_it_capture_exceptions_type_nonblank check (length(btrim(exception_type)) > 0),
  constraint track_it_capture_exceptions_summary_nonblank check (length(btrim(safe_summary)) > 0),
  constraint track_it_capture_exceptions_connection_fk
    foreign key (integration_connection_id, company_id)
    references public.integration_connections (id, company_id) on delete restrict,
  constraint track_it_capture_exceptions_run_fk
    foreign key (capture_run_id) references public.track_it_capture_runs (id) on delete set null,
  constraint track_it_capture_exceptions_logical_order_fk
    foreign key (logical_order_id, company_id)
    references public.track_it_logical_orders (id, company_id) on delete cascade,
  constraint track_it_capture_exceptions_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete restrict
);

create index track_it_capture_exceptions_open_idx
  on public.track_it_capture_exceptions (company_id, status, created_at desc)
  where status = 'OPEN';

create table public.track_it_acknowledgement_outbox (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id) on delete cascade,
  merchant_id                uuid not null,
  integration_connection_id  uuid not null,
  logical_order_id           uuid not null,
  communication_id           uuid,
  message_type               text not null default 'trackpod_welcome_acknowledgement',
  status                     public.track_it_acknowledgement_status not null default 'HELD',
  normalized_recipient       text not null,
  proposed_recipient         text not null,
  preview_subject            text not null,
  preview_body               text not null,
  hold_reasons               text[] not null default '{capture_only_release}',
  idempotency_key            text not null,
  delivery_provider          text,
  provider_message_id        text,
  prepared_at                timestamptz not null default now(),
  sent_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint track_it_acknowledgement_message_type_check check (message_type = 'trackpod_welcome_acknowledgement'),
  constraint track_it_acknowledgement_status_check check (status = 'HELD' and sent_at is null and provider_message_id is null),
  constraint track_it_acknowledgement_recipient_nonblank check (length(btrim(normalized_recipient)) > 0 and length(btrim(proposed_recipient)) > 0),
  constraint track_it_acknowledgement_preview_nonblank check (length(btrim(preview_subject)) > 0 and length(btrim(preview_body)) > 0),
  constraint track_it_acknowledgement_opaque_key check (idempotency_key !~ '@'),
  constraint track_it_acknowledgement_connection_fk
    foreign key (integration_connection_id, company_id)
    references public.integration_connections (id, company_id) on delete restrict,
  constraint track_it_acknowledgement_logical_order_fk
    foreign key (logical_order_id, company_id)
    references public.track_it_logical_orders (id, company_id) on delete cascade,
  constraint track_it_acknowledgement_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete restrict,
  constraint track_it_acknowledgement_communication_fk
    foreign key (communication_id, company_id)
    references public.communications (id, company_id) on delete set null,
  constraint track_it_acknowledgement_unique_recipient
    unique (company_id, integration_connection_id, logical_order_id, normalized_recipient, message_type)
);

create index track_it_acknowledgement_outbox_held_idx
  on public.track_it_acknowledgement_outbox (company_id, merchant_id, prepared_at desc)
  where status = 'HELD';

create trigger track_it_capture_runs_set_updated_at
  before update on public.track_it_capture_runs
  for each row execute function nexus.set_updated_at();

create trigger track_it_logical_orders_set_updated_at
  before update on public.track_it_logical_orders
  for each row execute function nexus.set_updated_at();

create trigger track_it_order_legs_set_updated_at
  before update on public.track_it_order_legs
  for each row execute function nexus.set_updated_at();

create trigger track_it_acknowledgement_outbox_set_updated_at
  before update on public.track_it_acknowledgement_outbox
  for each row execute function nexus.set_updated_at();

alter table public.track_it_capture_runs enable row level security;

alter table public.track_it_capture_runs force row level security;

alter table public.track_it_logical_orders enable row level security;

alter table public.track_it_logical_orders force row level security;

alter table public.track_it_order_legs enable row level security;

alter table public.track_it_order_legs force row level security;

alter table public.track_it_capture_exceptions enable row level security;

alter table public.track_it_capture_exceptions force row level security;

alter table public.track_it_acknowledgement_outbox enable row level security;

alter table public.track_it_acknowledgement_outbox force row level security;

create policy track_it_capture_runs_select on public.track_it_capture_runs
  for select to authenticated using (nexus.is_platform_super_admin());

create policy track_it_logical_orders_select on public.track_it_logical_orders
  for select to authenticated using (nexus.is_platform_super_admin());

create policy track_it_order_legs_select on public.track_it_order_legs
  for select to authenticated using (nexus.is_platform_super_admin());

create policy track_it_capture_exceptions_select on public.track_it_capture_exceptions
  for select to authenticated using (nexus.is_platform_super_admin());

create policy track_it_acknowledgement_outbox_select on public.track_it_acknowledgement_outbox
  for select to authenticated using (nexus.is_platform_super_admin());

create or replace function public.capture_trackpod_prepared_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  caller_profile_id uuid := auth.uid();
  run_id uuid := coalesce((batch->>'capture_run_id')::uuid, gen_random_uuid());
  target_company_id uuid := (batch->>'company_id')::uuid;
  target_merchant_id uuid := nullif(batch->>'merchant_id', '')::uuid;
  target_connection_id uuid := (batch->>'integration_connection_id')::uuid;
  logical_ref text;
  logical_id uuid;
  existing_logical_id uuid;
  existing_logical_merchant_id uuid;
  existing_logical_reference text;
  effective_merchant_id uuid;
  leg_id uuid;
  leg jsonb;
  ack jsonb;
  exception jsonb;
  conflict_summary text;
begin
  if caller_profile_id is null then
    raise exception 'Track It capture requires an authenticated user';
  end if;

  if not exists (
    select 1
    from public.platform_super_admins psa
    where psa.profile_id = caller_profile_id
      and psa.revoked_at is null
  ) then
    raise exception 'Track It capture is restricted to platform super admins';
  end if;

  insert into public.track_it_capture_runs (
    id, company_id, merchant_id, integration_connection_id, requested_start_date,
    requested_end_date, order_dates_requested, records_seen, logical_orders_seen,
    legs_upserted, held_acknowledgements, status, completed_at
  ) values (
    run_id,
    target_company_id,
    target_merchant_id,
    target_connection_id,
    (batch->>'requested_start_date')::date,
    (batch->>'requested_end_date')::date,
    coalesce(array(select jsonb_array_elements_text(batch->'order_dates_requested'))::date[], '{}'),
    coalesce((batch->>'records_seen')::integer, 0),
    coalesce((batch->>'logical_orders_seen')::integer, 0),
    coalesce((batch->>'legs_upserted')::integer, 0),
    coalesce((batch->>'held_acknowledgements')::integer, 0),
    'COMPLETED',
    now()
  ) on conflict (id) do update set
    records_seen = excluded.records_seen,
    logical_orders_seen = excluded.logical_orders_seen,
    legs_upserted = excluded.legs_upserted,
    held_acknowledgements = excluded.held_acknowledgements,
    status = 'COMPLETED',
    completed_at = now();

  create temporary table capture_merchant_conflicts (
    logical_order_reference text primary key,
    safe_summary text not null
  ) on commit drop;

  for leg in select jsonb_array_elements(coalesce(batch->'legs', '[]'::jsonb)) loop
    logical_ref := leg->>'logicalOrderReference';
    if logical_ref is null or length(btrim(logical_ref)) = 0 then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      target_company_id::text || ':' || target_connection_id::text || ':' || logical_ref,
      0
    ));

    effective_merchant_id := nullif(leg->>'merchantId', '')::uuid;
    if effective_merchant_id is null then
      effective_merchant_id := target_merchant_id;
    end if;

    select id, merchant_id
      into existing_logical_id, existing_logical_merchant_id
      from public.track_it_logical_orders
     where company_id = target_company_id
       and integration_connection_id = target_connection_id
       and logical_order_reference = logical_ref
     for update;

    if effective_merchant_id is null then
      effective_merchant_id := existing_logical_merchant_id;
    end if;

    if existing_logical_id is not null
       and effective_merchant_id is not null
       and existing_logical_merchant_id is not null
       and existing_logical_merchant_id <> effective_merchant_id then
      insert into capture_merchant_conflicts values (
        logical_ref,
        'Existing logical order merchant attribution conflicts with this capture.'
      ) on conflict (logical_order_reference) do nothing;
      continue;
    end if;

    if nullif(leg->>'trackId', '') is not null then
      perform pg_advisory_xact_lock(hashtextextended(
        target_company_id::text || ':' || target_connection_id::text || ':' || (leg->>'trackId'),
        0
      ));

      select l.logical_order_id, o.logical_order_reference, l.merchant_id
        into existing_logical_id, existing_logical_reference, existing_logical_merchant_id
        from public.track_it_order_legs l
        join public.track_it_logical_orders o
          on o.id = l.logical_order_id and o.company_id = l.company_id
       where l.company_id = target_company_id
         and l.integration_connection_id = target_connection_id
         and l.track_id = leg->>'trackId'
       for update;

      if existing_logical_id is not null
         and (existing_logical_reference <> logical_ref
           or (effective_merchant_id is not null
             and existing_logical_merchant_id is not null
             and existing_logical_merchant_id <> effective_merchant_id)) then
        insert into capture_merchant_conflicts values (
          logical_ref,
          'TrackId is already associated with a different logical order or merchant.'
        ) on conflict (logical_order_reference) do nothing;
        continue;
      end if;
    end if;

    insert into public.track_it_logical_orders (
      company_id, merchant_id, integration_connection_id, logical_order_reference,
      first_order_date, last_order_date, last_seen_at
    ) values (
      target_company_id,
      effective_merchant_id,
      target_connection_id,
      logical_ref,
      nullif(leg->>'orderDate', '')::date,
      nullif(leg->>'orderDate', '')::date,
      now()
    ) on conflict (company_id, integration_connection_id, logical_order_reference) do update set
      first_order_date = least(track_it_logical_orders.first_order_date, excluded.first_order_date),
      last_order_date = greatest(track_it_logical_orders.last_order_date, excluded.last_order_date),
      last_seen_at = now()
      where track_it_logical_orders.merchant_id is null
         or excluded.merchant_id is null
         or track_it_logical_orders.merchant_id = excluded.merchant_id
    returning id into logical_id;

    if logical_id is null then
      insert into capture_merchant_conflicts values (
        logical_ref,
        'Concurrent capture supplied conflicting merchant attribution.'
      ) on conflict (logical_order_reference) do nothing;
      continue;
    end if;

    insert into public.track_it_order_legs (
      company_id, merchant_id, logical_order_id, integration_connection_id,
      provider_order_id, track_id, journey_leg, order_date, status, track_link,
      contact_name, recipient_email_count, last_seen_at
    ) values (
      target_company_id,
      effective_merchant_id,
      logical_id,
      target_connection_id,
      nullif(leg->>'providerOrderId', ''),
      leg->>'trackId',
      leg->>'journeyLeg',
      nullif(leg->>'orderDate', '')::date,
      nullif(leg->>'status', ''),
      nullif(leg->>'trackLink', ''),
      nullif(leg->>'contactName', ''),
      coalesce((leg->>'recipientEmailCount')::integer, 0),
      now()
    ) on conflict (company_id, integration_connection_id, track_id) do update set
      logical_order_id = track_it_order_legs.logical_order_id,
      merchant_id = case
        when track_it_order_legs.merchant_id is null then excluded.merchant_id
        else track_it_order_legs.merchant_id
      end,
      provider_order_id = coalesce(excluded.provider_order_id, track_it_order_legs.provider_order_id),
      journey_leg = excluded.journey_leg,
      order_date = coalesce(excluded.order_date, track_it_order_legs.order_date),
      status = coalesce(excluded.status, track_it_order_legs.status),
      track_link = coalesce(excluded.track_link, track_it_order_legs.track_link),
      contact_name = coalesce(excluded.contact_name, track_it_order_legs.contact_name),
      recipient_email_count = excluded.recipient_email_count,
      last_seen_at = now()
      where track_it_order_legs.logical_order_id = excluded.logical_order_id
        and (track_it_order_legs.merchant_id is null
          or excluded.merchant_id is null
          or track_it_order_legs.merchant_id = excluded.merchant_id)
    returning id into leg_id;

    if leg_id is null then
      insert into capture_merchant_conflicts values (
        logical_ref,
        'TrackId is already associated with a different logical order or merchant.'
      ) on conflict (logical_order_reference) do nothing;
    end if;
  end loop;

  for logical_ref, conflict_summary in select logical_order_reference, safe_summary from capture_merchant_conflicts loop
    select id into logical_id
      from public.track_it_logical_orders
     where company_id = target_company_id
       and integration_connection_id = target_connection_id
       and logical_order_reference = logical_ref;

    update public.track_it_acknowledgement_outbox
       set hold_reasons = array(
             select distinct reason
               from unnest(hold_reasons || array['merchant_attribution_conflict']) as reason
           ),
           updated_at = now()
     where company_id = target_company_id
       and integration_connection_id = target_connection_id
       and logical_order_id = logical_id;

    insert into public.track_it_capture_exceptions (
      company_id, merchant_id, integration_connection_id, capture_run_id,
      logical_order_id, exception_type, safe_summary
    ) values (
      target_company_id, target_merchant_id, target_connection_id, run_id,
      logical_id, 'merchant_attribution_conflict', conflict_summary
    );
  end loop;

  for ack in select jsonb_array_elements(coalesce(batch->'held_acknowledgements_preview', '[]'::jsonb)) loop
    logical_ref := ack->>'logicalOrderReference';
    select id, merchant_id into logical_id, effective_merchant_id
    from public.track_it_logical_orders
    where company_id = target_company_id
      and integration_connection_id = target_connection_id
      and logical_order_reference = logical_ref;

     if logical_id is null or effective_merchant_id is null
       or exists (select 1 from capture_merchant_conflicts where logical_order_reference = logical_ref) then
      continue;
    end if;

    insert into public.track_it_acknowledgement_outbox (
      company_id, merchant_id, integration_connection_id, logical_order_id,
      normalized_recipient, proposed_recipient, preview_subject, preview_body,
      hold_reasons, idempotency_key, status
    ) values (
      target_company_id,
      effective_merchant_id,
      target_connection_id,
      logical_id,
      ack->>'normalizedRecipient',
      ack->>'proposedRecipient',
      ack->>'previewSubject',
      ack->>'previewBody',
      coalesce(array(select jsonb_array_elements_text(ack->'holdReasons')), '{capture_only_release}'),
      ack->>'idempotencyKey',
      'HELD'
    ) on conflict (company_id, integration_connection_id, logical_order_id, normalized_recipient, message_type) do update set
      proposed_recipient = excluded.proposed_recipient,
      preview_subject = excluded.preview_subject,
      preview_body = excluded.preview_body,
      hold_reasons = excluded.hold_reasons,
      idempotency_key = excluded.idempotency_key,
      status = 'HELD',
      sent_at = null,
      provider_message_id = null,
      prepared_at = now();
  end loop;

  for exception in select jsonb_array_elements(coalesce(batch->'exceptions', '[]'::jsonb)) loop
    logical_id := null;
    logical_ref := exception->>'logicalOrderReference';
    if logical_ref is not null and length(btrim(logical_ref)) > 0 then
      select id into logical_id
      from public.track_it_logical_orders
      where company_id = target_company_id
        and integration_connection_id = target_connection_id
        and logical_order_reference = logical_ref;
    end if;

    insert into public.track_it_capture_exceptions (
      company_id, merchant_id, integration_connection_id, capture_run_id,
      logical_order_id, exception_type, safe_summary
    ) values (
      target_company_id,
      target_merchant_id,
      target_connection_id,
      run_id,
      logical_id,
      exception->>'type',
      exception->>'safeSummary'
    );
  end loop;

  return jsonb_build_object('capture_run_id', run_id, 'status', 'COMPLETED');
end;
$$;

revoke execute on function public.capture_trackpod_prepared_batch(jsonb) from public;

revoke execute on function public.capture_trackpod_prepared_batch(jsonb) from anon, service_role;

grant execute on function public.capture_trackpod_prepared_batch(jsonb) to authenticated;

grant select on
  public.track_it_capture_runs,
  public.track_it_logical_orders,
  public.track_it_order_legs,
  public.track_it_capture_exceptions,
  public.track_it_acknowledgement_outbox
to authenticated;

grant all on
  public.track_it_capture_runs,
  public.track_it_logical_orders,
  public.track_it_order_legs,
  public.track_it_capture_exceptions,
  public.track_it_acknowledgement_outbox
to service_role;
