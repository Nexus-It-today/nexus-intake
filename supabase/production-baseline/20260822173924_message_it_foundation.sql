-- Nexusit_today - Message it Phase 1A database foundation
-- Created 2026-08-22 02:00:11 UTC.
--
-- This migration stores communication identity, thread, interaction, event,
-- link and read-state foundations. Provider integrations, delivery workers,
-- usage accounting and operator timing belong to later phases.
--
-- Tenancy remains owned by the canonical Nexus company/merchant model. The
-- existing nexus authorization functions are the only access boundary used.

-- ----------------------------------------------------------------------------
-- 1. Types
-- ----------------------------------------------------------------------------

create type public.communication_identity_type as enum (
  'PHONE_E164', 'EMAIL_CANONICAL', 'WHATSAPP_PROVIDER', 'NEXUS_PROFILE'
);

create type public.communication_binding_type as enum (
  'MERCHANT', 'CUSTOMER', 'NEXUS_PROFILE', 'PROVIDER_ACCOUNT_REFERENCE',
  'COMPANY_CONTACT_EXTERNAL'
);

create type public.communication_conversation_status as enum (
  'UNRESOLVED', 'OPEN', 'AMBIGUOUS', 'RESOLVED', 'CLOSED', 'ARCHIVED'
);

create type public.communication_channel as enum (
  'CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'INTERNAL'
);

create type public.communication_direction as enum (
  'INBOUND', 'OUTBOUND', 'INTERNAL'
);

create type public.communication_status as enum (
  'CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'CLAIMED',
  'REPLIED', 'RESOLVED', 'FAILED'
);

create type public.communication_participant_role as enum (
  'SENDER', 'RECIPIENT', 'CC', 'BCC', 'OPERATOR', 'INTERNAL_PARTICIPANT'
);

create type public.communication_event_type as enum (
  'CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'CLAIMED',
  'FIRST_RESPONSE', 'REPLIED', 'RESOLVED', 'FAILED'
);

create type public.communication_event_source as enum (
  'APPLICATION', 'PROVIDER', 'SYSTEM'
);

create type public.communication_link_type as enum (
  'COMPANY', 'MERCHANT', 'CUSTOMER', 'PROFILE', 'ORDER', 'JOURNEY_LEG',
  'TRACK_ID', 'EXTERNAL'
);

create type public.communication_link_role as enum (
  'PRIMARY', 'RELATED', 'COLLECTION', 'DELIVERY', 'CANDIDATE'
);

-- ----------------------------------------------------------------------------
-- 2. Identity and ownership bindings
-- ----------------------------------------------------------------------------

create table public.communication_identities (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  identity_type         public.communication_identity_type not null,
  normalized_value      text not null,
  display_value         text,
  normalization_version text not null default 'v1',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint communication_identities_company_identity_unique
    unique (company_id, identity_type, normalized_value),
  constraint communication_identities_normalized_value_nonempty
    check (length(btrim(normalized_value)) > 0)
);

create unique index communication_identities_id_company_unique
  on public.communication_identities (id, company_id);
create index communication_identities_lookup_idx
  on public.communication_identities (company_id, identity_type, normalized_value);

create table public.communication_identity_bindings (
  id                         uuid primary key default gen_random_uuid(),
  identity_id                uuid not null,
  company_id                 uuid not null,
  binding_type               public.communication_binding_type not null,
  merchant_id                uuid,
  customer_id                uuid,
  profile_id                 uuid,
  provider_account_reference text,
  external_reference         text,
  confidence                 numeric(5, 4) not null default 1.0,
  is_confirmed               boolean not null default false,
  confirmed_by               uuid references public.profiles (id) on delete set null,
  confirmed_at               timestamptz,
  valid_from                 timestamptz not null default now(),
  valid_to                   timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint communication_identity_bindings_identity_fk
    foreign key (identity_id, company_id)
    references public.communication_identities (id, company_id) on delete cascade,
  constraint communication_identity_bindings_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete cascade,
  constraint communication_identity_bindings_customer_fk
    foreign key (customer_id, company_id)
    references public.customers (id, company_id) on delete cascade,
  constraint communication_identity_bindings_profile_fk
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint communication_identity_bindings_target_shape
    check (
      (binding_type = 'MERCHANT' and merchant_id is not null and customer_id is null and profile_id is null and provider_account_reference is null and external_reference is null)
      or (binding_type = 'CUSTOMER' and merchant_id is null and customer_id is not null and profile_id is null and provider_account_reference is null and external_reference is null)
      or (binding_type = 'NEXUS_PROFILE' and merchant_id is null and customer_id is null and profile_id is not null and provider_account_reference is null and external_reference is null)
      or (binding_type = 'PROVIDER_ACCOUNT_REFERENCE' and merchant_id is null and customer_id is null and profile_id is null and provider_account_reference is not null and length(btrim(provider_account_reference)) > 0 and external_reference is null)
      or (binding_type = 'COMPANY_CONTACT_EXTERNAL' and merchant_id is null and customer_id is null and profile_id is null and provider_account_reference is null and external_reference is not null and length(btrim(external_reference)) > 0)
    ),
  constraint communication_identity_bindings_confidence_range
    check (confidence >= 0 and confidence <= 1),
  constraint communication_identity_bindings_confirmation_pair
    check ((is_confirmed and confirmed_by is not null and confirmed_at is not null) or (not is_confirmed and confirmed_by is null and confirmed_at is null)),
  constraint communication_identity_bindings_validity_order
    check (valid_to is null or valid_to > valid_from)
);

create index communication_identity_bindings_identity_idx
  on public.communication_identity_bindings (company_id, identity_id, valid_from desc);
create index communication_identity_bindings_merchant_idx
  on public.communication_identity_bindings (company_id, merchant_id) where merchant_id is not null;
create index communication_identity_bindings_customer_idx
  on public.communication_identity_bindings (company_id, customer_id) where customer_id is not null;
create index communication_identity_bindings_profile_idx
  on public.communication_identity_bindings (company_id, profile_id) where profile_id is not null;

-- Deterministic resolution later uses only current valid bindings and must leave
-- multiple current matches ambiguous. This migration preserves multiple bindings,
-- confidence, confirmation state, valid_from and valid_to without creating a
-- competing resolver table or claiming runtime resolution.

-- ----------------------------------------------------------------------------
-- 3. Conversations and individual communications
-- ----------------------------------------------------------------------------

create table public.communication_conversations (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  merchant_id          uuid,
  subject              text,
  status               public.communication_conversation_status not null default 'UNRESOLVED',
  assigned_profile_id  uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  first_response_at    timestamptz,
  resolved_at          timestamptz,
  closed_at            timestamptz,
  constraint communication_conversations_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete cascade,
  constraint communication_conversations_id_company_unique
    unique (id, company_id),
  constraint communication_conversations_timestamp_order
    check (
      (first_response_at is null or first_response_at >= created_at)
      and (resolved_at is null or resolved_at >= created_at)
      and (closed_at is null or closed_at >= coalesce(resolved_at, created_at))
    )
);

create index communication_conversations_company_time_idx
  on public.communication_conversations (company_id, created_at desc);
create index communication_conversations_merchant_time_idx
  on public.communication_conversations (company_id, merchant_id, created_at desc);
create index communication_conversations_status_idx
  on public.communication_conversations (company_id, status, created_at desc);
create index communication_conversations_assigned_idx
  on public.communication_conversations (company_id, assigned_profile_id, status)
  where assigned_profile_id is not null;

create table public.communications (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  merchant_id           uuid,
  conversation_id       uuid not null,
  channel               public.communication_channel not null,
  direction             public.communication_direction not null,
  status                public.communication_status not null default 'CREATED',
  body                  text,
  subject               text,
  provider_name         text,
  provider_message_ref  text,
  claimed_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  sent_at               timestamptz,
  delivered_at          timestamptz,
  read_at               timestamptz,
  claimed_at            timestamptz,
  first_response_at     timestamptz,
  replied_at            timestamptz,
  resolved_at           timestamptz,
  constraint communications_conversation_fk
    foreign key (conversation_id, company_id)
    references public.communication_conversations (id, company_id) on delete cascade,
  constraint communications_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete cascade,
  constraint communications_internal_provider_check
    check (channel <> 'INTERNAL' or (provider_name is null and provider_message_ref is null)),
  constraint communications_direction_check
    check ((direction = 'INTERNAL' and channel = 'INTERNAL') or direction <> 'INTERNAL'),
  constraint communications_timestamp_order
    check (
      (sent_at is null or sent_at >= created_at)
      and (delivered_at is null or delivered_at >= coalesce(sent_at, created_at))
      and (read_at is null or read_at >= coalesce(delivered_at, sent_at, created_at))
      and (claimed_at is null or claimed_at >= created_at)
      and (first_response_at is null or first_response_at >= created_at)
      and (replied_at is null or replied_at >= coalesce(first_response_at, created_at))
      and (resolved_at is null or resolved_at >= created_at)
    ),
  constraint communications_id_company_unique unique (id, company_id)
);

create index communications_company_channel_time_idx
  on public.communications (company_id, channel, created_at desc);
create index communications_merchant_time_idx
  on public.communications (company_id, merchant_id, created_at desc);
create index communications_conversation_timeline_idx
  on public.communications (conversation_id, created_at asc);
create index communications_status_idx
  on public.communications (company_id, status, created_at desc);
create index communications_assigned_idx
  on public.communications (company_id, claimed_by_profile_id, status)
  where claimed_by_profile_id is not null;
create index communications_provider_ref_idx
  on public.communications (provider_name, provider_message_ref)
  where provider_message_ref is not null;

-- Communications service grants use the exact canonical domain/action strings:
-- required_domain = 'communications', required_action = 'write'.
create or replace function nexus.can_operate_communication(
  target_company_id uuid,
  target_merchant_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or nexus.has_company_role(
         target_company_id,
         array['owner', 'administrator', 'operator']::public.membership_role[]
       )
    or (
      target_merchant_id is not null
      and exists (
        select 1
        from public.merchant_memberships mm
        where mm.company_id = target_company_id
          and mm.merchant_id = target_merchant_id
          and mm.profile_id = auth.uid()
          and mm.status = 'active'
          and mm.role in ('owner', 'administrator', 'operator')
      )
    )
    or nexus.has_service_access(target_company_id, 'communications', target_merchant_id, 'write');
$$;

revoke execute on function nexus.can_operate_communication(uuid, uuid) from public;
grant execute on function nexus.can_operate_communication(uuid, uuid) to authenticated, service_role;

-- Keep a communication's merchant scope aligned with its conversation. This
-- prevents a child row from acquiring a different merchant boundary.
create or replace function nexus.validate_communication_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.communication_conversations c
    where c.id = new.conversation_id
      and c.company_id = new.company_id
      and c.merchant_id is not distinct from new.merchant_id
  ) then
    raise exception 'communication merchant scope must match its conversation';
  end if;
  return new;
end;
$$;

revoke execute on function nexus.validate_communication_scope() from public;
grant execute on function nexus.validate_communication_scope() to service_role;

create trigger communications_validate_scope
  before insert or update on public.communications
  for each row execute function nexus.validate_communication_scope();

create or replace function nexus.validate_communication_identity_binding_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.binding_type = 'NEXUS_PROFILE' and not exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = new.company_id
      and cm.profile_id = new.profile_id
      and cm.status = 'active'
  ) then
    raise exception 'profile binding target must be an active company member';
  end if;
  return new;
end;
$$;

revoke execute on function nexus.validate_communication_identity_binding_target() from public;
grant execute on function nexus.validate_communication_identity_binding_target() to service_role;

create trigger communication_identity_bindings_validate_profile
  before insert or update on public.communication_identity_bindings
  for each row execute function nexus.validate_communication_identity_binding_target();

create or replace function nexus.validate_communication_link_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.link_type = 'COMPANY' and not exists (
    select 1
    from public.companies c
    where c.id = new.entity_id
      and c.id = new.company_id
  ) then
    raise exception 'company link target must belong to the link company';
  end if;

  if new.link_type = 'MERCHANT' and not exists (
    select 1
    from public.merchants m
    where m.id = new.entity_id
      and m.company_id = new.company_id
  ) then
    raise exception 'merchant link target must belong to the link company';
  end if;

  if new.link_type = 'CUSTOMER' and not exists (
    select 1
    from public.customers c
    where c.id = new.entity_id
      and c.company_id = new.company_id
  ) then
    raise exception 'customer link target must belong to the link company';
  end if;

  if new.link_type = 'PROFILE' and not exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = new.company_id
      and cm.profile_id = new.entity_id
      and cm.status = 'active'
  ) then
    raise exception 'profile link target must be an active company member';
  end if;

  if new.link_type = 'EXTERNAL' and (
    new.reference_namespace is null
    or length(btrim(new.reference_namespace)) = 0
    or new.external_reference is null
    or length(btrim(new.external_reference)) = 0
  ) then
    raise exception 'external link target requires a nonblank namespace and external reference';
  end if;

  if new.link_type in ('ORDER', 'JOURNEY_LEG') and new.universal_order_number is not null and (
    new.reference_namespace is null
    or length(btrim(new.reference_namespace)) = 0
    or new.reference_date is null
  ) then
    raise exception 'external order and journey links require a reference namespace and reference date';
  end if;

  return new;
end;
$$;

revoke execute on function nexus.validate_communication_link_target() from public;
grant execute on function nexus.validate_communication_link_target() to service_role;

-- ----------------------------------------------------------------------------
-- 4. Participants and immutable lifecycle events
-- ----------------------------------------------------------------------------

create table public.communication_participants (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null,
  communication_id uuid not null,
  participant_role public.communication_participant_role not null,
  identity_id      uuid,
  profile_id       uuid,
  created_at       timestamptz not null default now(),
  constraint communication_participants_communication_fk
    foreign key (communication_id, company_id)
    references public.communications (id, company_id) on delete cascade,
  constraint communication_participants_identity_fk
    foreign key (identity_id, company_id)
    references public.communication_identities (id, company_id) on delete cascade,
  constraint communication_participants_profile_fk
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint communication_participants_one_subject
    check (num_nonnulls(identity_id, profile_id) = 1)
);

create index communication_participants_identity_idx
  on public.communication_participants (company_id, identity_id)
  where identity_id is not null;
create index communication_participants_profile_idx
  on public.communication_participants (company_id, profile_id)
  where profile_id is not null;
create index communication_participants_communication_idx
  on public.communication_participants (communication_id, participant_role);

create table public.communication_events (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null,
  communication_id        uuid not null,
  event_type              public.communication_event_type not null,
  event_source            public.communication_event_source not null default 'APPLICATION',
  provider_name           text,
  provider_event_identity text,
  occurred_at             timestamptz not null default now(),
  actor_profile_id        uuid references public.profiles (id) on delete set null,
  event_status            text,
  created_at              timestamptz not null default now(),
  constraint communication_events_communication_fk
    foreign key (communication_id, company_id)
    references public.communications (id, company_id) on delete cascade,
  constraint communication_events_source_check
    check (event_source <> 'PROVIDER' or provider_event_identity is not null)
);

create unique index communication_events_provider_idempotency_idx
  on public.communication_events (provider_name, provider_event_identity)
  where provider_event_identity is not null;
create index communication_events_timeline_idx
  on public.communication_events (communication_id, occurred_at asc);
create index communication_events_company_timeline_idx
  on public.communication_events (company_id, occurred_at desc);

-- application API routes create verified INTERNAL lifecycle events.
-- operators cannot forge provider delivery/read/call/billing evidence.
-- communication_events remain immutable after insertion.
create or replace function nexus.prevent_communication_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  raise exception 'communication events are immutable';
end;
$$;

revoke execute on function nexus.prevent_communication_event_mutation() from public;
grant execute on function nexus.prevent_communication_event_mutation() to service_role;

create trigger communication_events_prevent_mutation
  before update or delete on public.communication_events
  for each row execute function nexus.prevent_communication_event_mutation();

-- ----------------------------------------------------------------------------
-- 5. Operational links
-- ----------------------------------------------------------------------------

create table public.communication_links (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null,
  communication_id      uuid not null,
  link_type             public.communication_link_type not null,
  entity_id             uuid,
  reference_namespace   text,
  reference_date        date,
  external_reference    text,
  universal_order_number text,
  journey_leg           text,
  track_id              text,
  link_role             public.communication_link_role not null default 'RELATED',
  confidence            numeric(5, 4) not null default 1.0,
  is_confirmed          boolean not null default false,
  confirmed_by          uuid references public.profiles (id) on delete set null,
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint communication_links_communication_fk
    foreign key (communication_id, company_id)
    references public.communications (id, company_id) on delete cascade,
  constraint communication_links_shape
    check (
      (link_type in ('COMPANY', 'MERCHANT', 'CUSTOMER', 'PROFILE') and entity_id is not null and reference_namespace is null and reference_date is null and external_reference is null and universal_order_number is null and journey_leg is null and track_id is null)
      or (link_type = 'ORDER' and num_nonnulls(entity_id, universal_order_number) = 1 and (entity_id is not null or (reference_namespace is not null and length(btrim(reference_namespace)) > 0 and reference_date is not null and universal_order_number is not null and length(btrim(universal_order_number)) > 0)) and external_reference is null and journey_leg is null and track_id is null)
      or (link_type = 'JOURNEY_LEG' and entity_id is null and reference_namespace is not null and length(btrim(reference_namespace)) > 0 and reference_date is not null and universal_order_number is not null and length(btrim(universal_order_number)) > 0 and journey_leg in ('COLLECTION', 'DELIVERY') and track_id is null and link_role = journey_leg::public.communication_link_role)
      or (link_type = 'TRACK_ID' and entity_id is null and reference_namespace is null and reference_date is null and external_reference is null and universal_order_number is null and journey_leg is null and track_id is not null and length(btrim(track_id)) > 0)
      or (link_type = 'EXTERNAL' and entity_id is null and reference_namespace is not null and length(btrim(reference_namespace)) > 0 and reference_date is null and external_reference is not null and length(btrim(external_reference)) > 0 and universal_order_number is null and journey_leg is null and track_id is null)
    ),
  constraint communication_links_confidence_range
    check (confidence >= 0 and confidence <= 1),
  constraint communication_links_confirmation_pair
    check ((is_confirmed and confirmed_by is not null and confirmed_at is not null) or (not is_confirmed and confirmed_by is null and confirmed_at is null))
);

create unique index communication_links_confirmed_entity_unique_idx
  on public.communication_links (communication_id, link_type, entity_id)
  where is_confirmed and entity_id is not null;

create unique index communication_links_confirmed_external_unique_idx
  on public.communication_links (communication_id, reference_namespace, external_reference)
  where is_confirmed and link_type = 'EXTERNAL'::public.communication_link_type;

create unique index communication_links_confirmed_order_unique_idx
  on public.communication_links (communication_id, reference_namespace, reference_date, universal_order_number)
  where is_confirmed
    and link_type = 'ORDER'::public.communication_link_type
    and entity_id is null;

create unique index communication_links_confirmed_journey_leg_unique_idx
  on public.communication_links (communication_id, reference_namespace, reference_date, universal_order_number, journey_leg)
  where is_confirmed and link_type = 'JOURNEY_LEG'::public.communication_link_type;

create unique index communication_links_confirmed_track_unique_idx
  on public.communication_links (communication_id, track_id)
  where is_confirmed and link_type = 'TRACK_ID'::public.communication_link_type;
-- same namespace + same reference deduplicates.
-- different namespace + same reference remains distinct.
create index communication_links_company_order_idx
  on public.communication_links (company_id, reference_namespace, reference_date, universal_order_number)
  where universal_order_number is not null;
create index communication_links_company_track_idx
  on public.communication_links (company_id, track_id)
  where track_id is not null;
create index communication_links_unresolved_idx
  on public.communication_links (company_id, communication_id, confidence)
  where not is_confirmed;

create trigger communication_links_validate_target
  before insert or update on public.communication_links
  for each row execute function nexus.validate_communication_link_target();

-- ----------------------------------------------------------------------------
-- 6. Per-profile read state
-- ----------------------------------------------------------------------------

create table public.communication_notification_reads (
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  communication_id    uuid not null,
  company_id          uuid not null,
  read_at             timestamptz not null default now(),
  last_seen_event_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (profile_id, communication_id),
  constraint communication_notification_reads_communication_fk
    foreign key (communication_id, company_id)
    references public.communications (id, company_id) on delete cascade,
  constraint communication_notification_reads_timestamp_order
    check (last_seen_event_at is null or last_seen_event_at >= created_at)
);

create index communication_notification_reads_unread_idx
  on public.communication_notification_reads (profile_id, read_at, communication_id);
create index communication_notification_reads_communication_idx
  on public.communication_notification_reads (company_id, communication_id, profile_id);

-- ----------------------------------------------------------------------------
-- 7. Shared timestamp triggers
-- ----------------------------------------------------------------------------

create trigger communication_identities_set_updated_at
  before update on public.communication_identities
  for each row execute function nexus.set_updated_at();
create trigger communication_identity_bindings_set_updated_at
  before update on public.communication_identity_bindings
  for each row execute function nexus.set_updated_at();
create trigger communication_conversations_set_updated_at
  before update on public.communication_conversations
  for each row execute function nexus.set_updated_at();
create trigger communications_set_updated_at
  before update on public.communications
  for each row execute function nexus.set_updated_at();
create trigger communication_links_set_updated_at
  before update on public.communication_links
  for each row execute function nexus.set_updated_at();
create trigger communication_notification_reads_set_updated_at
  before update on public.communication_notification_reads
  for each row execute function nexus.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------------------

alter table public.communication_identities enable row level security;
alter table public.communication_identities force row level security;
alter table public.communication_identity_bindings enable row level security;
alter table public.communication_identity_bindings force row level security;
alter table public.communication_conversations enable row level security;
alter table public.communication_conversations force row level security;
alter table public.communications enable row level security;
alter table public.communications force row level security;
alter table public.communication_participants enable row level security;
alter table public.communication_participants force row level security;
alter table public.communication_events enable row level security;
alter table public.communication_events force row level security;
alter table public.communication_links enable row level security;
alter table public.communication_links force row level security;
alter table public.communication_notification_reads enable row level security;
alter table public.communication_notification_reads force row level security;

-- Company/merchant read access is canonical Nexus access plus scoped service access.
-- Writes require management authority or an active communications write grant.
create policy communication_identities_select on public.communication_identities
  for select to authenticated
  using (
    nexus.can_access_company(company_id, 'communications')
    or exists (
      select 1
      from public.communication_identity_bindings b
      where b.identity_id = communication_identities.id
        and b.company_id = communication_identities.company_id
        and b.merchant_id is not null
        and nexus.can_access_merchant(b.company_id, b.merchant_id, 'communications')
    )
  );
create policy communication_identities_write on public.communication_identities
  for all to authenticated
  using (nexus.can_manage_company(company_id) or nexus.has_service_access(company_id, 'communications', null, 'write'))
  with check (nexus.can_manage_company(company_id) or nexus.has_service_access(company_id, 'communications', null, 'write'));

create policy communication_identity_bindings_select on public.communication_identity_bindings
  for select to authenticated
  using (nexus.can_access_company(company_id, 'communications') or (merchant_id is not null and nexus.can_access_merchant(company_id, merchant_id, 'communications')));
create policy communication_identity_bindings_write on public.communication_identity_bindings
  for all to authenticated
  using (nexus.can_manage_company(company_id) or (merchant_id is not null and nexus.can_manage_merchant(company_id, merchant_id)) or nexus.has_service_access(company_id, 'communications', merchant_id, 'write'))
  with check (nexus.can_manage_company(company_id) or (merchant_id is not null and nexus.can_manage_merchant(company_id, merchant_id)) or nexus.has_service_access(company_id, 'communications', merchant_id, 'write'));

create policy communication_conversations_select on public.communication_conversations
  for select to authenticated
  using (case when merchant_id is null then nexus.can_access_company(company_id, 'communications') else nexus.can_access_merchant(company_id, merchant_id, 'communications') end);
create policy communication_conversations_insert on public.communication_conversations
  for insert to authenticated
  with check (nexus.can_operate_communication(company_id, merchant_id));
create policy communication_conversations_update on public.communication_conversations
  for update to authenticated
  using (nexus.can_operate_communication(company_id, merchant_id))
  with check (nexus.can_operate_communication(company_id, merchant_id));

create policy communications_select on public.communications
  for select to authenticated
  using (case when merchant_id is null then nexus.can_access_company(company_id, 'communications') else nexus.can_access_merchant(company_id, merchant_id, 'communications') end);
create policy communications_insert on public.communications
  for insert to authenticated
  with check (
    channel = 'INTERNAL'
    and provider_name is null
    and provider_message_ref is null
    and nexus.can_operate_communication(company_id, merchant_id)
  );
create policy communications_update on public.communications
  for update to authenticated
  using (nexus.can_operate_communication(company_id, merchant_id))
  with check (nexus.can_operate_communication(company_id, merchant_id));

create policy communication_participants_select on public.communication_participants
  for select to authenticated
  using (exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_participants.company_id and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)));
create policy communication_participants_write on public.communication_participants
  for all to authenticated
  using (exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_participants.company_id and (case when c.merchant_id is null then nexus.can_manage_company(c.company_id) else nexus.can_manage_merchant(c.company_id, c.merchant_id) end)))
  with check (exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_participants.company_id and (case when c.merchant_id is null then nexus.can_manage_company(c.company_id) else nexus.can_manage_merchant(c.company_id, c.merchant_id) end)));

-- No authenticated INSERT/UPDATE/DELETE policy exists for events. Provider and
-- system ingestion is granted only to service_role below.
create policy communication_events_select on public.communication_events
  for select to authenticated
  using (exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_events.company_id and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)));

create policy communication_links_select on public.communication_links
  for select to authenticated
  using (exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_links.company_id and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)));
create policy communication_links_write on public.communication_links
  for all to authenticated
  using (exists (select 1 from public.communications c where c.id = communication_links.communication_id and c.company_id = communication_links.company_id and nexus.can_operate_communication(c.company_id, c.merchant_id)))
  with check (exists (select 1 from public.communications c where c.id = communication_links.communication_id and c.company_id = communication_links.company_id and nexus.can_operate_communication(c.company_id, c.merchant_id)));

create policy communication_notification_reads_select on public.communication_notification_reads
  for select to authenticated
  using (
    (profile_id = auth.uid() or nexus.is_platform_super_admin())
    and exists (
      select 1 from public.communications c
      where c.id = communication_id
        and c.company_id = communication_notification_reads.company_id
        and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)
    )
  );
create policy communication_notification_reads_insert on public.communication_notification_reads
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.communications c where c.id = communication_id and c.company_id = communication_notification_reads.company_id and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end))
  );
create policy communication_notification_reads_update on public.communication_notification_reads
  for update to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.communications c
      where c.id = communication_id
        and c.company_id = communication_notification_reads.company_id
        and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.communications c
      where c.id = communication_id
        and c.company_id = communication_notification_reads.company_id
        and (case when c.merchant_id is null then nexus.can_access_company(c.company_id, 'communications') else nexus.can_access_merchant(c.company_id, c.merchant_id, 'communications') end)
    )
  );

-- ----------------------------------------------------------------------------
-- 9. Explicit privileges
-- ----------------------------------------------------------------------------

-- No grants are made to anon. These grants expose only the table surface; RLS
-- remains authoritative for authenticated rows.
grant select, insert, update, delete on
  public.communication_identities,
  public.communication_identity_bindings,
  public.communication_conversations,
  public.communications,
  public.communication_participants,
  public.communication_links,
  public.communication_notification_reads
to authenticated;
grant select on public.communication_events to authenticated;

grant all on
  public.communication_identities,
  public.communication_identity_bindings,
  public.communication_conversations,
  public.communications,
  public.communication_participants,
  public.communication_events,
  public.communication_links,
  public.communication_notification_reads
to service_role;

grant execute on function nexus.validate_communication_scope() to service_role;
grant execute on function nexus.can_operate_communication(uuid, uuid) to authenticated, service_role;
grant execute on function nexus.validate_communication_link_target() to service_role;
grant execute on function nexus.prevent_communication_event_mutation() to service_role;

-- Audit actions are recorded by application/service workflows in the existing
-- public.audit_events table. This migration intentionally creates no audit or
-- usage table and no automatic duplicate audit events. Future actions include
-- communication_created, communication_viewed, claimed, assigned, linked,
-- unlinked, message_sent, read_state_changed, resolved and reopened.
