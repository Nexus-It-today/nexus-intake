-- ============================================================================
-- Nexusit_today - Migration 001: tenancy and security foundation
-- ============================================================================
--
-- Canonical ownership chain:
--
--     Platform -> Company -> Merchant -> Customer
--
-- Rules encoded by this migration:
--   * company_id is the canonical tenant boundary. There is deliberately no
--     organisation_id anywhere in this schema.
--   * A merchant belongs to exactly one company.
--   * A customer lives inside the company (and optionally merchant) boundary.
--   * Ordinary users never see another company's records.
--   * A merchant-scoped user cannot escape their merchant scope.
--   * Platform super-admin access is explicit, granted, revocable and audited.
--   * Cross-business service access (for example Swifteam delivering a
--     contracted service, or VanDriver.work recruitment reached through the
--     Recru.it connector package) is an explicit, scoped, time-bound and
--     revocable grant. Access is never ownership.
--
-- Isolation is enforced by Row Level Security, not by the interface.
--
-- Build order is significant:
--   1. extensions and schemas
--   2. enumerated types
--   3. tables, constraints and indexes
--   4. helper functions (created BEFORE any policy or trigger uses them)
--   5. triggers
--   6. row level security and policies
--   7. grants
--   8. reference data
--
-- This migration rebuilds from a completely empty database and makes no manual
-- or undocumented assumptions about existing objects.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Extensions and schemas
-- ----------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- Helper functions live in a private schema that is NOT exposed through the
-- Data API, so tenancy checks can never be called directly by a client.
create schema if not exists nexus;

comment on schema nexus is
  'Private helper functions for Nexusit_today tenancy and security. Not exposed through the Data API.';

-- ----------------------------------------------------------------------------
-- 2. Enumerated types
-- ----------------------------------------------------------------------------

create type public.company_status as enum ('trial', 'active', 'suspended', 'archived');

create type public.merchant_status as enum ('planned', 'active', 'archived');

create type public.customer_status as enum ('draft', 'active', 'archived');

-- Roles are ordered from most to least privileged within a company.
create type public.membership_role as enum ('owner', 'administrator', 'operator', 'viewer');

create type public.membership_status as enum ('invited', 'active', 'suspended');

-- Whether a company membership reaches the whole company, or only the
-- merchants named in merchant_memberships.
create type public.access_scope as enum ('company', 'merchant');

create type public.grant_status as enum ('pending', 'active', 'expired', 'revoked');

create type public.entitlement_status as enum ('trial', 'active', 'suspended', 'cancelled');

-- Connection states the integrations UI is designed around.
create type public.connection_status as enum ('not_configured', 'connected', 'degraded', 'error', 'disconnected');

-- Distinguishes a Nexus capability (Drive it) from a connector package into a
-- separate business (Recru.it), so the commercial boundary stays legible.
create type public.module_kind as enum ('platform', 'capability', 'connector');

-- The basis on which an action was taken. Recorded on every audit event.
create type public.actor_authority as enum ('member', 'super_admin', 'service_access', 'system');

-- ----------------------------------------------------------------------------
-- 3. Tables
-- ----------------------------------------------------------------------------

-- 3.1 Profiles -----------------------------------------------------------------
-- Authentication identity (auth.users) is separate from business membership.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Platform-side person record, one per auth.users row. Identity is separate from business membership.';

-- 3.2 Platform super-admins ----------------------------------------------------
-- The ONLY route to cross-company access. A row is live while revoked_at is
-- null, so revocation preserves history rather than deleting it.

create table public.platform_super_admins (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint platform_super_admins_revocation_complete
    check (num_nonnulls(revoked_at, revoked_by) <> 1)
);

-- At most one live grant per person; revoked rows are retained.
create unique index platform_super_admins_active_profile_idx
  on public.platform_super_admins (profile_id)
  where revoked_at is null;

comment on table public.platform_super_admins is
  'Explicit platform super-admin grants. Live while revoked_at is null. Revocation retains history.';

-- 3.3 Companies ----------------------------------------------------------------

create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  trading_name        text,
  slug                text not null,
  status              public.company_status not null default 'trial',
  -- Marks a company that exists to deliver services to other companies (for
  -- example Swifteam). It is still an ordinary tenant of its own records and
  -- gains nothing implicitly from this flag.
  is_service_provider boolean not null default false,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint companies_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

create unique index companies_slug_key on public.companies (slug);

create index companies_status_idx on public.companies (status);

comment on table public.companies is
  'Subscribing tenant. company_id is the canonical tenancy boundary across the whole platform.';

-- Allows composite foreign keys that pin a child row to the same company.
alter table public.companies add constraint companies_id_unique unique (id);

-- 3.4 Company memberships ------------------------------------------------------

create table public.company_memberships (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  role          public.membership_role not null default 'viewer',
  -- 'merchant' confines the member to merchants named in merchant_memberships.
  access_scope  public.access_scope not null default 'company',
  status        public.membership_status not null default 'invited',
  invited_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint company_memberships_unique unique (company_id, profile_id),
  -- Company-wide authority cannot be held on a merchant-scoped membership.
  constraint company_memberships_scope_role
    check (access_scope = 'company' or role in ('operator', 'viewer'))
);

create index company_memberships_profile_idx on public.company_memberships (profile_id);

create index company_memberships_company_idx on public.company_memberships (company_id);

comment on table public.company_memberships is
  'Explicit membership of a company. Access is granted here, never inferred from identity.';

-- 3.5 Merchants ----------------------------------------------------------------

create table public.merchants (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  reference   text not null,
  status      public.merchant_status not null default 'planned',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint merchants_reference_unique unique (company_id, reference)
);

create index merchants_company_idx on public.merchants (company_id);

-- Target for composite foreign keys that keep children in the same company.
alter table public.merchants add constraint merchants_id_company_unique unique (id, company_id);

comment on table public.merchants is
  'Trading entity belonging to exactly one company.';

-- 3.6 Merchant memberships -----------------------------------------------------
-- company_id is carried so tenancy checks never need a join.

create table public.merchant_memberships (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null,
  company_id   uuid not null,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  role         public.membership_role not null default 'operator',
  status       public.membership_status not null default 'invited',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint merchant_memberships_unique unique (merchant_id, profile_id),
  constraint merchant_memberships_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete cascade
);

create index merchant_memberships_profile_idx on public.merchant_memberships (profile_id);

create index merchant_memberships_company_idx on public.merchant_memberships (company_id);

comment on table public.merchant_memberships is
  'Merchant-scoped access within a company. The composite FK guarantees the merchant belongs to the stated company.';

-- 3.7 Customers ----------------------------------------------------------------

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  merchant_id        uuid,
  name               text not null,
  account_reference  text not null,
  status             public.customer_status not null default 'draft',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint customers_reference_unique unique (company_id, account_reference),
  -- A customer may sit directly under the company, but if a merchant is set it
  -- must belong to the same company.
  constraint customers_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete set null
);

create index customers_company_idx on public.customers (company_id);

create index customers_merchant_idx on public.customers (merchant_id);

alter table public.customers add constraint customers_id_company_unique unique (id, company_id);

comment on table public.customers is
  'Customer inside the company/merchant tenancy boundary. Never held outside a company.';

-- 3.8 Service access grants ----------------------------------------------------
-- The controlled mechanism for cross-business access. Swifteam and
-- VanDriver.work (reached commercially through the Recru.it connector) are
-- separate businesses; they receive scoped grants, never tenancy.

create table public.service_access_grants (
  id                   uuid primary key default gen_random_uuid(),
  provider_company_id  uuid not null references public.companies (id) on delete cascade,
  target_company_id    uuid not null references public.companies (id) on delete cascade,
  -- When set, the grant reaches only this merchant within the target company.
  target_merchant_id   uuid,
  permitted_domains    text[] not null default '{}',
  permitted_actions    text[] not null default '{}',
  effective_from       timestamptz not null default now(),
  effective_to         timestamptz,
  status               public.grant_status not null default 'pending',
  reason               text not null,
  contract_reference   text,
  granted_by           uuid references public.profiles (id) on delete set null,
  revoked_at           timestamptz,
  revoked_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint service_access_grants_not_self check (provider_company_id <> target_company_id),
  constraint service_access_grants_period check (effective_to is null or effective_to > effective_from),
  constraint service_access_grants_domains_present check (cardinality(permitted_domains) > 0),
  constraint service_access_grants_merchant_fk
    foreign key (target_merchant_id, target_company_id)
    references public.merchants (id, company_id) on delete cascade
);

create index service_access_grants_provider_idx on public.service_access_grants (provider_company_id);

create index service_access_grants_target_idx on public.service_access_grants (target_company_id);

create index service_access_grants_active_idx
  on public.service_access_grants (target_company_id, provider_company_id)
  where status = 'active';

comment on table public.service_access_grants is
  'Explicit, scoped, time-bound and revocable cross-business access. Access is never ownership.';

-- 3.9 Modules and entitlements -------------------------------------------------
-- Platform-level catalogue. Not tenant data.

create table public.modules (
  key         text primary key,
  name        text not null,
  kind        public.module_kind not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint modules_key_format check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

comment on table public.modules is
  'Catalogue of platform modules, Nexus capabilities (Drive it) and connector packages (Recru.it).';

create table public.module_entitlements (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  module_key         text not null references public.modules (key) on delete restrict,
  status             public.entitlement_status not null default 'trial',
  included_allowance integer,
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint module_entitlements_unique unique (company_id, module_key),
  constraint module_entitlements_period check (ends_at is null or ends_at > starts_at),
  constraint module_entitlements_allowance check (included_allowance is null or included_allowance >= 0)
);

create index module_entitlements_company_idx on public.module_entitlements (company_id);

comment on table public.module_entitlements is
  'Which modules, capabilities and connector packages a company is entitled to.';

-- 3.10 Integrations ------------------------------------------------------------
-- Catalogue is platform-level; connections are tenant data.

create table public.integrations (
  key         text primary key,
  name        text not null,
  category    text not null,
  purpose     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint integrations_key_format check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

comment on table public.integrations is
  'Catalogue of supported integrations. Platform-level reference data.';

create table public.integration_connections (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  integration_key  text not null references public.integrations (key) on delete restrict,
  status           public.connection_status not null default 'not_configured',
  -- Non-secret configuration only. Credentials belong in the platform secret
  -- store and must never be written to this column.
  config           jsonb not null default '{}'::jsonb,
  connected_at     timestamptz,
  last_sync_at     timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint integration_connections_unique unique (company_id, integration_key)
);

create index integration_connections_company_idx on public.integration_connections (company_id);

comment on column public.integration_connections.config is
  'Non-secret configuration only. Credentials must never be written here.';

-- 3.11 Usage events ------------------------------------------------------------
-- Every useful action is an "it" and is measurable. Pricing is deliberately not
-- hard-coded here; pricing_metadata carries only what a rating process needs.

create table public.usage_events (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  merchant_id          uuid,
  customer_id          uuid references public.customers (id) on delete set null,
  actor_profile_id     uuid references public.profiles (id) on delete set null,
  module_key           text references public.modules (key) on delete set null,
  event_type           text not null,
  quantity             numeric(14, 4) not null default 1,
  unit                 text not null default 'action',
  source               text not null default 'platform',
  related_record_type  text,
  related_record_id    uuid,
  is_billable          boolean not null default true,
  pricing_metadata     jsonb not null default '{}'::jsonb,
  metadata             jsonb not null default '{}'::jsonb,
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint usage_events_quantity_positive check (quantity >= 0),
  constraint usage_events_related_record check (num_nonnulls(related_record_type, related_record_id) <> 1),
  constraint usage_events_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete set null,
  constraint usage_events_customer_fk
    foreign key (customer_id, company_id)
    references public.customers (id, company_id) on delete set null
);

create index usage_events_company_occurred_idx on public.usage_events (company_id, occurred_at desc);

create index usage_events_event_type_idx on public.usage_events (company_id, event_type, occurred_at desc);

create index usage_events_billable_idx
  on public.usage_events (company_id, occurred_at desc)
  where is_billable;

create index usage_events_related_idx on public.usage_events (related_record_type, related_record_id);

comment on table public.usage_events is
  'Measured platform actions ("its") used for entitlement consumption and billing. Pricing is never hard-coded here.';

-- 3.12 Audit events ------------------------------------------------------------
-- Append-only. company_id is nullable because some events are platform-level
-- (for example granting super-admin access).

create table public.audit_events (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid references public.companies (id) on delete set null,
  merchant_id             uuid,
  actor_profile_id        uuid references public.profiles (id) on delete set null,
  -- The basis on which access was exercised, plus the service-provider context
  -- when the actor was working under a cross-business grant.
  actor_authority         public.actor_authority not null default 'member',
  provider_company_id     uuid references public.companies (id) on delete set null,
  service_access_grant_id uuid references public.service_access_grants (id) on delete set null,
  action                  text not null,
  resource_type           text,
  resource_id             uuid,
  context                 jsonb not null default '{}'::jsonb,
  occurred_at             timestamptz not null default now(),
  -- Service-access actions must record which provider acted.
  constraint audit_events_service_context
    check (actor_authority <> 'service_access' or (provider_company_id is not null and service_access_grant_id is not null)),
  constraint audit_events_merchant_company_required
    check (merchant_id is null or company_id is not null),
  constraint audit_events_provider_grant_pair
    check (num_nonnulls(provider_company_id, service_access_grant_id) <> 1),
  constraint audit_events_merchant_fk
    foreign key (merchant_id, company_id)
    references public.merchants (id, company_id) on delete set null
);

create index audit_events_company_idx on public.audit_events (company_id, occurred_at desc);

create index audit_events_actor_idx on public.audit_events (actor_profile_id, occurred_at desc);

create index audit_events_resource_idx on public.audit_events (resource_type, resource_id);

create index audit_events_provider_idx
  on public.audit_events (provider_company_id, occurred_at desc)
  where provider_company_id is not null;

comment on table public.audit_events is
  'Append-only audit trail. actor_authority records the basis on which access was exercised.';

-- ----------------------------------------------------------------------------
-- 4. Helper functions
--
-- Defined AFTER the tables they read and BEFORE the policies and triggers that
-- call them.
--
-- All tenancy helpers are SECURITY DEFINER with a pinned search_path. This is
-- deliberate: it lets a policy on company_memberships ask "is this user a
-- member?" without re-entering that table's own policy, which would recurse.
-- No table below uses FORCE ROW LEVEL SECURITY, so the definer bypasses RLS.
-- ----------------------------------------------------------------------------

create or replace function nexus.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid();
$$;

create or replace function nexus.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.platform_super_admins psa
    where psa.profile_id = auth.uid()
      and psa.revoked_at is null
  );
$$;

comment on function nexus.is_platform_super_admin() is
  'True only while an explicit, unrevoked super-admin grant exists for the caller.';

-- Any active membership, including merchant-scoped. Use only for "does this
-- person belong to the company at all" questions.
create or replace function nexus.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = target_company_id
      and cm.profile_id = auth.uid()
      and cm.status = 'active'
  );
$$;

-- Company-wide reach. A merchant-scoped membership deliberately fails here.
create or replace function nexus.has_company_wide_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = target_company_id
      and cm.profile_id = auth.uid()
      and cm.status = 'active'
      and cm.access_scope = 'company'
  );
$$;

create or replace function nexus.has_company_role(
  target_company_id uuid,
  allowed_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = target_company_id
      and cm.profile_id = auth.uid()
      and cm.status = 'active'
      and cm.access_scope = 'company'
      and cm.role = any (allowed_roles)
  );
$$;

create or replace function nexus.is_merchant_member(target_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.merchant_memberships mm
    where mm.merchant_id = target_merchant_id
      and mm.profile_id = auth.uid()
      and mm.status = 'active'
  );
$$;

-- True when the caller belongs to a provider company holding a live grant over
-- the target company, covering the requested data domain. A merchant-scoped
-- grant never satisfies a company-level (null merchant) question.
create or replace function nexus.has_service_access(
  target_company_id uuid,
  required_domain text,
  target_merchant_id uuid default null,
  required_action text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.service_access_grants g
    join public.company_memberships cm
      on cm.company_id = g.provider_company_id
     and cm.profile_id = auth.uid()
     and cm.status = 'active'
    join public.companies provider
      on provider.id = g.provider_company_id
     and provider.is_service_provider
    where g.target_company_id = has_service_access.target_company_id
      and g.status = 'active'
      and g.revoked_at is null
      and g.effective_from <= now()
      and (g.effective_to is null or g.effective_to > now())
      and required_domain = any (g.permitted_domains)
      and required_action = any (g.permitted_actions)
      and (
        g.target_merchant_id is null
        or g.target_merchant_id = has_service_access.target_merchant_id
      )
  );
$$;

comment on function nexus.has_service_access(uuid, text, uuid, text) is
  'Cross-business authority. Scoped by domain, action and merchant, bounded by the grant period.';

-- Company-level access: used for records that are not merchant-specific.
create or replace function nexus.can_access_company(
  target_company_id uuid,
  required_domain text default 'operations'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or nexus.has_company_wide_access(target_company_id)
    or nexus.has_service_access(target_company_id, required_domain, null);
$$;

-- Merchant-level access: the check that prevents a merchant-scoped user from
-- escaping their scope.
create or replace function nexus.can_access_merchant(
  target_company_id uuid,
  target_merchant_id uuid,
  required_domain text default 'operations'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or nexus.has_company_wide_access(target_company_id)
    or (target_merchant_id is not null and nexus.is_merchant_member(target_merchant_id))
    or nexus.has_service_access(target_company_id, required_domain, target_merchant_id);
$$;

-- Company-level write authority.
create or replace function nexus.can_manage_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or nexus.has_company_role(
         target_company_id,
         array['owner', 'administrator']::public.membership_role[]
       );
$$;

-- Merchant-level write authority: company administrators, or a merchant member
-- holding an administrative role on that merchant.
create or replace function nexus.can_manage_merchant(
  target_company_id uuid,
  target_merchant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.can_manage_company(target_company_id)
    or exists (
      select 1
      from public.merchant_memberships mm
      where mm.merchant_id = target_merchant_id
        and mm.profile_id = auth.uid()
        and mm.status = 'active'
        and mm.role in ('owner', 'administrator')
    );
$$;

-- Shared updated_at trigger.
create or replace function nexus.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Creates a profile whenever an auth user is created.
create or replace function nexus.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function nexus.validate_service_access_provider()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.companies c
    where c.id = new.provider_company_id
      and c.is_service_provider
  ) then
    raise exception 'service access provider must be an authorised service provider company';
  end if;
  return new;
end;
$$;

create or replace function nexus.validate_service_provider_flag()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.is_service_provider is distinct from old.is_service_provider
     and not (nexus.is_platform_super_admin() or auth.role() = 'service_role') then
    raise exception 'only platform super-admins or the service role may change service-provider authorization';
  end if;
  return new;
end;
$$;

create or replace function nexus.validate_audit_event_context()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  grant_provider_company_id uuid;
  grant_target_company_id uuid;
begin
  if new.service_access_grant_id is not null then
    select g.provider_company_id, g.target_company_id
      into grant_provider_company_id, grant_target_company_id
    from public.service_access_grants g
    where g.id = new.service_access_grant_id;

    if not found
       or new.provider_company_id is distinct from grant_provider_company_id
       or new.company_id is distinct from grant_target_company_id then
      raise exception 'audit event service access context does not match its grant';
    end if;
  end if;
  return new;
end;
$$;

create or replace function nexus.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Triggers
-- ----------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function nexus.set_updated_at();

create trigger platform_super_admins_set_updated_at
  before update on public.platform_super_admins
  for each row execute function nexus.set_updated_at();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function nexus.set_updated_at();

create trigger company_memberships_set_updated_at
  before update on public.company_memberships
  for each row execute function nexus.set_updated_at();

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function nexus.set_updated_at();

create trigger merchant_memberships_set_updated_at
  before update on public.merchant_memberships
  for each row execute function nexus.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function nexus.set_updated_at();

create trigger service_access_grants_set_updated_at
  before update on public.service_access_grants
  for each row execute function nexus.set_updated_at();

create trigger modules_set_updated_at
  before update on public.modules
  for each row execute function nexus.set_updated_at();

create trigger module_entitlements_set_updated_at
  before update on public.module_entitlements
  for each row execute function nexus.set_updated_at();

create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function nexus.set_updated_at();

create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function nexus.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function nexus.handle_new_auth_user();

create trigger service_access_grants_validate_provider
  before insert or update on public.service_access_grants
  for each row execute function nexus.validate_service_access_provider();

create trigger companies_validate_service_provider
  before update on public.companies
  for each row execute function nexus.validate_service_provider_flag();

create trigger audit_events_validate_context
  before insert or update on public.audit_events
  for each row execute function nexus.validate_audit_event_context();

create trigger audit_events_prevent_mutation
  before update or delete on public.audit_events
  for each row execute function nexus.prevent_audit_event_mutation();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
--
-- Enabled on every tenant-sensitive table. Reference catalogues (modules,
-- integrations) are readable by any authenticated user but writable only by
-- platform super-admins.
-- ----------------------------------------------------------------------------

alter table public.profiles                enable row level security;

alter table public.platform_super_admins   enable row level security;

alter table public.companies               enable row level security;

alter table public.company_memberships     enable row level security;

alter table public.merchants               enable row level security;

alter table public.merchant_memberships    enable row level security;

alter table public.customers               enable row level security;

alter table public.service_access_grants   enable row level security;

alter table public.modules                 enable row level security;

alter table public.module_entitlements     enable row level security;

alter table public.integrations            enable row level security;

alter table public.integration_connections enable row level security;

alter table public.usage_events            enable row level security;

alter table public.audit_events            enable row level security;

-- 6.1 Profiles -----------------------------------------------------------------

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or nexus.is_platform_super_admin());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 6.2 Platform super-admins ----------------------------------------------------
-- Readable by super-admins and by the person holding the grant, so it can never
-- be exercised invisibly. Writes are service-role only (no policy granted).

create policy platform_super_admins_select on public.platform_super_admins
  for select to authenticated
  using (profile_id = auth.uid() or nexus.is_platform_super_admin());

-- 6.3 Companies ----------------------------------------------------------------
-- A merchant-scoped member still needs to see the company they belong to.

create policy companies_select on public.companies
  for select to authenticated
  using (
    nexus.is_platform_super_admin()
    or nexus.is_company_member(id)
    or nexus.has_service_access(id, 'company', null)
  );

create policy companies_update on public.companies
  for update to authenticated
  using (nexus.can_manage_company(id))
  with check (nexus.can_manage_company(id));

-- 6.4 Company memberships ------------------------------------------------------

create policy company_memberships_select on public.company_memberships
  for select to authenticated
  using (profile_id = auth.uid() or nexus.can_access_company(company_id, 'company'));

create policy company_memberships_insert on public.company_memberships
  for insert to authenticated
  with check (nexus.can_manage_company(company_id));

create policy company_memberships_update on public.company_memberships
  for update to authenticated
  using (nexus.can_manage_company(company_id))
  with check (nexus.can_manage_company(company_id));

create policy company_memberships_delete on public.company_memberships
  for delete to authenticated
  using (nexus.can_manage_company(company_id));

-- 6.5 Merchants ----------------------------------------------------------------
-- Merchant-scoped members see only their own merchants.

create policy merchants_select on public.merchants
  for select to authenticated
  using (nexus.can_access_merchant(company_id, id, 'operations'));

create policy merchants_insert on public.merchants
  for insert to authenticated
  with check (nexus.can_manage_company(company_id));

create policy merchants_update on public.merchants
  for update to authenticated
  using (nexus.can_manage_merchant(company_id, id))
  with check (nexus.can_manage_merchant(company_id, id));

create policy merchants_delete on public.merchants
  for delete to authenticated
  using (nexus.can_manage_company(company_id));

-- 6.6 Merchant memberships -----------------------------------------------------

create policy merchant_memberships_select on public.merchant_memberships
  for select to authenticated
  using (
    profile_id = auth.uid()
    or nexus.can_access_merchant(company_id, merchant_id, 'company')
  );

create policy merchant_memberships_write on public.merchant_memberships
  for all to authenticated
  using (nexus.can_manage_company(company_id))
  with check (nexus.can_manage_company(company_id));

-- 6.7 Customers ----------------------------------------------------------------
-- A customer with no merchant is company-level and needs company-wide access.

create policy customers_select on public.customers
  for select to authenticated
  using (
    case
      when merchant_id is null then nexus.can_access_company(company_id, 'customers')
      else nexus.can_access_merchant(company_id, merchant_id, 'customers')
    end
  );

create policy customers_write on public.customers
  for all to authenticated
  using (
    case
      when merchant_id is null then nexus.can_manage_company(company_id)
      else nexus.can_manage_merchant(company_id, merchant_id)
    end
  )
  with check (
    case
      when merchant_id is null then nexus.can_manage_company(company_id)
      else nexus.can_manage_merchant(company_id, merchant_id)
    end
  );

-- 6.8 Service access grants ----------------------------------------------------
-- Visible to both sides of the relationship so a grant can never be secret.
-- Only the target company (or a super-admin) may create or amend one.

create policy service_access_grants_select on public.service_access_grants
  for select to authenticated
  using (
    nexus.is_platform_super_admin()
    or nexus.is_company_member(target_company_id)
    or nexus.is_company_member(provider_company_id)
  );

create policy service_access_grants_write on public.service_access_grants
  for all to authenticated
  using (nexus.can_manage_company(target_company_id))
  with check (nexus.can_manage_company(target_company_id));

-- 6.9 Modules and entitlements -------------------------------------------------

create policy modules_select on public.modules
  for select to authenticated
  using (true);

create policy modules_write on public.modules
  for all to authenticated
  using (nexus.is_platform_super_admin())
  with check (nexus.is_platform_super_admin());

create policy module_entitlements_select on public.module_entitlements
  for select to authenticated
  using (nexus.can_access_company(company_id, 'billing'));

-- Entitlements follow commercial agreement, so they are platform-managed.
create policy module_entitlements_write on public.module_entitlements
  for all to authenticated
  using (nexus.is_platform_super_admin())
  with check (nexus.is_platform_super_admin());

-- 6.10 Integrations ------------------------------------------------------------

create policy integrations_select on public.integrations
  for select to authenticated
  using (true);

create policy integrations_write on public.integrations
  for all to authenticated
  using (nexus.is_platform_super_admin())
  with check (nexus.is_platform_super_admin());

create policy integration_connections_select on public.integration_connections
  for select to authenticated
  using (nexus.can_access_company(company_id, 'integrations'));

create policy integration_connections_write on public.integration_connections
  for all to authenticated
  using (nexus.can_manage_company(company_id))
  with check (nexus.can_manage_company(company_id));

-- 6.11 Usage events ------------------------------------------------------------
-- Readable within the tenancy boundary. Writes are service-role only, so usage
-- cannot be fabricated by a client.

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (
    case
      when merchant_id is null then nexus.can_access_company(company_id, 'billing')
      else nexus.can_access_merchant(company_id, merchant_id, 'billing')
    end
  );

-- 6.12 Audit events ------------------------------------------------------------
-- Readable by company administrators and super-admins. Append-only: no client
-- update or delete policy is granted. Authenticated actors may insert only
-- events that identify themselves and remain inside their authorised scope.
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (
    actor_profile_id = auth.uid()
    and (
      (
        actor_authority = 'member'
        and company_id is not null
        and (
          (merchant_id is null and nexus.has_company_wide_access(company_id))
          or (merchant_id is not null and nexus.is_merchant_member(merchant_id))
        )
      )
      or (
        actor_authority = 'service_access'
        and company_id is not null
        and nexus.has_service_access(company_id, 'audit', merchant_id, 'write')
      )
    )
  );

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    nexus.is_platform_super_admin()
    or (company_id is not null and nexus.can_manage_company(company_id))
  );

-- ----------------------------------------------------------------------------
-- 7. Grants
--
-- config.toml does not auto-expose new entities, so access is granted
-- explicitly. RLS still governs which rows are visible.
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.profiles,
  public.platform_super_admins,
  public.companies,
  public.company_memberships,
  public.merchants,
  public.merchant_memberships,
  public.customers,
  public.service_access_grants,
  public.modules,
  public.module_entitlements,
  public.integrations,
  public.integration_connections,
  public.usage_events,
  public.audit_events
to authenticated;

grant insert, update, delete on
  public.company_memberships,
  public.merchants,
  public.merchant_memberships,
  public.customers,
  public.service_access_grants,
  public.modules,
  public.module_entitlements,
  public.integrations,
  public.integration_connections
to authenticated;

grant update on public.profiles to authenticated;

grant update on public.companies to authenticated;

grant insert on public.audit_events to authenticated;

-- Server-side processes retain full access; RLS is bypassed by service_role.
grant all on all tables in schema public to service_role;

-- Helper functions are callable but the schema itself is not API-exposed.
grant usage on schema nexus to authenticated, service_role;

revoke execute on all functions in schema nexus from public;

grant execute on function nexus.current_profile_id() to service_role;

grant execute on function nexus.is_platform_super_admin() to authenticated, service_role;

grant execute on function nexus.is_company_member(uuid) to authenticated, service_role;

grant execute on function nexus.has_company_wide_access(uuid) to authenticated, service_role;

grant execute on function nexus.has_company_role(uuid, public.membership_role[]) to authenticated, service_role;

grant execute on function nexus.is_merchant_member(uuid) to authenticated, service_role;

grant execute on function nexus.has_service_access(uuid, text, uuid, text) to authenticated, service_role;

grant execute on function nexus.can_access_company(uuid, text) to authenticated, service_role;

grant execute on function nexus.can_access_merchant(uuid, uuid, text) to authenticated, service_role;

grant execute on function nexus.can_manage_company(uuid) to authenticated, service_role;

grant execute on function nexus.can_manage_merchant(uuid, uuid) to authenticated, service_role;

grant execute on function nexus.set_updated_at() to authenticated, service_role;

grant execute on function nexus.handle_new_auth_user() to service_role;

grant execute on function nexus.validate_service_access_provider() to service_role;

grant execute on function nexus.validate_service_provider_flag() to service_role;

grant execute on function nexus.validate_audit_event_context() to service_role;

grant execute on function nexus.prevent_audit_event_mutation() to service_role;

-- ----------------------------------------------------------------------------
-- 8. Reference data
--
-- Catalogue rows only. No tenant data, no users, no secrets. Safe to re-run.
-- ----------------------------------------------------------------------------

insert into public.modules (key, name, kind, description) values
  ('platform', 'Nexus platform', 'platform',
   'Core system of record: companies, merchants, customers, jobs, documents, communications and audit history.'),
  ('drive-it', 'Drive it', 'capability',
   'Nexus driver marketplace and execution layer.'),
  ('recru-it', 'Recru.it', 'connector',
   'Nexus connector and subscription package into VanDriver.work recruitment services. Not the recruitment business.')
on conflict (key) do nothing;

insert into public.integrations (key, name, category, purpose) values
  ('github',        'GitHub',        'Infrastructure',
   'Source of truth for code, migrations and the Knowledge Base.'),
  ('codespaces',    'Codespaces',    'Infrastructure', 'Development environment.'),
  ('vercel',        'Vercel',        'Infrastructure', 'Hosting and delivery for the marketing site and the app.'),
  ('supabase',      'Supabase',      'Infrastructure', 'Canonical Postgres database, authentication and RLS.'),
  ('godaddy',       'GoDaddy',       'Domains',        'Domain registration and DNS.'),
  ('microsoft-365', 'Microsoft 365', 'Communications', 'Business email and identity.'),
  ('resend',        'Resend',        'Communications', 'Transactional application email.'),
  ('circleloop',    'CircleLoop',    'Communications', 'Telephony and call activity.'),
  ('whatsapp',      'WhatsApp',      'Communications', 'Customer and driver messaging.'),
  ('track-pod',     'Track-POD',     'Operations',
   'Delivery execution and proof of delivery. Nexus remains the system of record.')
on conflict (key) do nothing;
