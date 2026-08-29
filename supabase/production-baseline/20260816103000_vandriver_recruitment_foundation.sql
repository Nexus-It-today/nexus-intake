-- ============================================================================
-- Nexusit_today - Migration 002: VanDriver.work recruitment foundation
-- ============================================================================
--
-- VanDriver.work is a SEPARATE recruitment business. This migration creates
-- its own operational tables, reproducing the useful data and workflows from
-- the VanDriver.work Airtable base (appdiM41pZUFemYwW: Clients, Vacancies,
-- Candidates, Applications, Advertising Subscribers, Job Board Orders).
--
-- Boundary rules encoded by this migration:
--   * VanDriver recruitment records are NOT merged into the Nexus
--     Company -> Merchant -> Customer tenancy tables. There is deliberately
--     no company_id anywhere in this schema.
--   * Access is explicit and granted via vandriver_recruitment_access. Nexus
--     company membership never implies VanDriver access, and vice versa.
--   * A vacancy-scoped grant reaches ONLY that vacancy (and its applicants),
--     never its client or sibling vacancies. A client-scoped grant reaches
--     that client and its vacancies. Only a fully unscoped grant reaches the
--     whole estate.
--   * Platform super-admin status is reused from the core platform
--     (nexus.is_platform_super_admin()) because it is the same identity and
--     the same explicit, audited concept — not because the two businesses
--     share tenancy.
--   * This migration does not alter Migration 001 (foundation_tenancy) and
--     does not touch companies, merchants, customers or their policies.
--
-- Build order mirrors Migration 001:
--   1. schema
--   2. enumerated types
--   3. tables, constraints and indexes
--   4. helper functions
--   5. triggers
--   6. row level security and policies
--   7. grants
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Schema
-- ----------------------------------------------------------------------------

-- Private helper functions for VanDriver recruitment access. Not exposed
-- through the Data API (only "public" and "graphql_public" are, per
-- supabase/config.toml). Kept separate from the "nexus" schema so recruitment
-- access logic never becomes coupled to Nexus tenancy logic.
create schema if not exists vandriver_security;

comment on schema vandriver_security is
  'Private helper functions for VanDriver.work recruitment access. Not exposed through the Data API. Deliberately separate from the nexus schema.';

-- ----------------------------------------------------------------------------
-- 2. Enumerated types
-- ----------------------------------------------------------------------------

create type public.vandriver_client_status as enum ('prospect', 'active', 'inactive', 'archived');

create type public.vandriver_candidate_status as enum ('new', 'active', 'placed', 'inactive', 'archived');

create type public.vandriver_document_type as enum ('cv', 'right_to_work', 'driving_licence', 'dbs_certificate', 'other');

create type public.vandriver_vacancy_status as enum ('draft', 'published', 'filled', 'on_hold', 'closed', 'expired');

-- Matches the existing ATS workflow exactly.
create type public.vandriver_application_status as enum (
  'new', 'review', 'shortlist', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'
);

create type public.vandriver_subscription_status as enum ('trial', 'active', 'past_due', 'cancelled', 'expired');

create type public.vandriver_job_board_order_status as enum ('pending', 'ordered', 'posted', 'expired', 'cancelled');

-- Ordered from least to most privileged. Distinct from public.membership_role
-- (Nexus tenancy) so the two access models can never be confused.
create type public.vandriver_access_role as enum ('viewer', 'recruiter', 'administrator');

-- Employer portal membership. Several people may belong to one employer, and
-- one person may belong to several employers, so this is a membership row,
-- not a single column on vandriver_clients.
create type public.vandriver_client_user_role as enum ('viewer', 'manager');

create type public.vandriver_client_user_status as enum ('invited', 'active', 'suspended');

-- ----------------------------------------------------------------------------
-- 3. Tables
-- ----------------------------------------------------------------------------

-- 3.1 Clients --------------------------------------------------------------
-- Employer/client master record. Root of the VanDriver data model — deliberately
-- has no company_id, because a VanDriver client is not a Nexus tenant.

create table public.vandriver_clients (
  id                  uuid primary key default gen_random_uuid(),
  legacy_client_ref    text,
  company_name        text not null,
  trading_name        text,
  company_number      text,
  nature_of_business  text,
  website             text,
  address             text,
  contact_name        text,
  contact_role        text,
  email               text,
  phone               text,
  source_site         text,
  client_status       public.vandriver_client_status not null default 'prospect',
  internal_notes      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index vandriver_clients_legacy_ref_key
  on public.vandriver_clients (legacy_client_ref)
  where legacy_client_ref is not null;

create index vandriver_clients_email_idx on public.vandriver_clients (lower(email)) where email is not null;

create index vandriver_clients_status_idx on public.vandriver_clients (client_status);

comment on table public.vandriver_clients is
  'VanDriver.work employer/client master record. Deliberately separate from Nexus companies — no company_id.';

comment on column public.vandriver_clients.legacy_client_ref is
  'Airtable client_uuid / external reference, retained for migration and reconciliation only.';

-- 3.2 Client portal membership --------------------------------------------------
-- Explicit employer-user membership rather than a single auth_user_id column,
-- because a realistic employer has several portal users and one person may
-- work across several employers (recruitment agencies, group accounts).
-- 'manager' may edit the non-staff-controlled fields on their own client
-- record (enforced by vandriver_security.enforce_client_self_service_columns);
-- 'viewer' is read-only.

create table public.vandriver_client_users (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.vandriver_clients (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.vandriver_client_user_role not null default 'viewer',
  status      public.vandriver_client_user_status not null default 'invited',
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vandriver_client_users_unique unique (client_id, profile_id)
);

create index vandriver_client_users_client_idx on public.vandriver_client_users (client_id);

create index vandriver_client_users_profile_idx on public.vandriver_client_users (profile_id);

comment on table public.vandriver_client_users is
  'Explicit employer portal membership. One client may have several users; one user may belong to several clients.';

-- 3.3 Candidates -------------------------------------------------------------
-- Master candidate/driver talent record. Shared talent pool, not scoped to a
-- client.
--
-- Candidate self-service is a deliberate one-account/record relationship
-- (auth_user_id): a driver is one person applying under one identity, unlike
-- an employer, which realistically has several portal users.

create table public.vandriver_candidates (
  id                              uuid primary key default gen_random_uuid(),
  candidate_ref                   text not null,
  legacy_candidate_ref             text,
  -- Optional link for future candidate self-service login. One candidate,
  -- one account — see table comment above.
  auth_user_id                    uuid references auth.users (id) on delete set null,
  name                            text not null,
  email                           text,
  phone                           text,
  postcode                        text,
  driving_licence                 text,
  own_van                         boolean,
  van_type                        text,
  work_wanted                     text,
  -- Airtable stores Travel Radius as free text (e.g. "50 miles", "Nationwide").
  -- Raw value is preserved verbatim; travel_radius_miles is a derived numeric
  -- value populated by import/normalisation when the raw text has a clear
  -- leading numeric distance, and left null otherwise pending manual review.
  travel_radius_raw               text,
  travel_radius_miles             integer,
  availability                    text,
  experience                      text,
  talent_network_consent          boolean not null default false,
  source                          text,
  status                          public.vandriver_candidate_status not null default 'new',
  internal_notes                  text,
  registered_at                   timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  candidate_type                  text,
  roles_wanted                    text[] not null default '{}',
  preferred_locations              text[] not null default '{}',
  -- Airtable multipleSelects: an array preserves every selected value.
  employment_preference           text[] not null default '{}',
  working_pattern                 text[] not null default '{}',
  manual_handling_experience       boolean,
  two_person_delivery_experience   boolean,
  warehouse_skills                 text[] not null default '{}',
  flt_licence_type                text,
  transport_admin_skills          text[] not null default '{}',
  -- Airtable multilineText: a single free-text block, not a multi-select.
  systems_experience               text,
  swift_local_area                text,
  constraint vandriver_candidates_ref_unique unique (candidate_ref),
  constraint vandriver_candidates_travel_radius_miles_check
    check (travel_radius_miles is null or travel_radius_miles >= 0)
);

create unique index vandriver_candidates_legacy_ref_key
  on public.vandriver_candidates (legacy_candidate_ref)
  where legacy_candidate_ref is not null;

-- Enforces "one auth account = one candidate record": a given auth_user_id
-- may be linked to at most one candidate row.
create unique index vandriver_candidates_auth_user_unique
  on public.vandriver_candidates (auth_user_id)
  where auth_user_id is not null;

create index vandriver_candidates_email_idx on public.vandriver_candidates (lower(email)) where email is not null;

create index vandriver_candidates_status_idx on public.vandriver_candidates (status);

create index vandriver_candidates_auth_user_idx on public.vandriver_candidates (auth_user_id) where auth_user_id is not null;

comment on table public.vandriver_candidates is
  'VanDriver.work candidate/driver talent record. CV and document binaries live in vandriver_candidate_documents, not here.';

comment on column public.vandriver_candidates.legacy_candidate_ref is
  'Airtable candidate external reference, retained for migration and reconciliation only.';

comment on column public.vandriver_candidates.travel_radius_raw is
  'Airtable Travel Radius raw text value (e.g. "50 miles", "Nationwide"), preserved verbatim.';

comment on column public.vandriver_candidates.travel_radius_miles is
  'Import transformation: parse a leading numeric distance from travel_radius_raw; null when no unambiguous number is present.';

comment on column public.vandriver_candidates.systems_experience is
  'Airtable multilineText free-text block, not a multi-select. Preserved as a single text value.';

-- 3.4 Candidate documents ----------------------------------------------------
-- CVs and future recruitment/compliance documents. Designed for Supabase
-- Storage rather than Airtable attachments — no binary data lives in Postgres.

create table public.vandriver_candidate_documents (
  id                  uuid primary key default gen_random_uuid(),
  -- RESTRICT, not CASCADE: a candidate with retained documents cannot be hard
  -- deleted as a side effect; deletion is an explicit administrative/GDPR act.
  candidate_id        uuid not null references public.vandriver_candidates (id) on delete restrict,
  document_type       public.vandriver_document_type not null default 'other',
  storage_object_key  text not null,
  original_filename   text,
  -- Only for records migrated from a system where the file still lives
  -- externally (for example a WordPress upload) pending re-upload to Storage.
  external_url        text,
  uploaded_at         timestamptz not null default now(),
  metadata            jsonb not null default '{}'::jsonb
);

create index vandriver_candidate_documents_candidate_idx on public.vandriver_candidate_documents (candidate_id);

create index vandriver_candidate_documents_type_idx on public.vandriver_candidate_documents (document_type);

comment on table public.vandriver_candidate_documents is
  'CVs and compliance documents. storage_object_key points into Supabase Storage; no binary data is stored in this table.';

-- 3.5 Vacancies ---------------------------------------------------------------
-- Employer vacancies, recruitment requirements and advertising requests.

create table public.vandriver_vacancies (
  id                      uuid primary key default gen_random_uuid(),
  vacancy_ref             text not null,
  legacy_vacancy_ref       text,
  legacy_wp_job_id         text,
  -- RESTRICT, not CASCADE: deleting a client must not silently erase its
  -- vacancy history. Hard deletion of a client with vacancies is blocked.
  client_id               uuid not null references public.vandriver_clients (id) on delete restrict,

  -- Commercial
  employment_type         text,
  service_level           text,
  advertising_plan        text,
  plan_monthly_price      numeric(10, 2),
  job_board_add_ons       text[] not null default '{}',
  board_add_on_total      numeric(10, 2),
  quoted_total            numeric(10, 2),

  -- Role
  job_title               text not null,
  positions               integer not null default 1,
  location                text,
  -- Airtable stores Start Date as free text. Raw value is preserved verbatim;
  -- start_date is a derived date populated by import when the raw text is an
  -- unambiguous date, and left null otherwise pending manual review.
  start_date_raw          text,
  start_date              date,
  duration                text,
  working_days            text,
  working_hours           text,
  -- Airtable stores Weekly Hours as free text (e.g. "40", "40-48 varies").
  -- Raw value is preserved verbatim; weekly_hours is a derived numeric value.
  weekly_hours_raw        text,
  weekly_hours            numeric(5, 2),
  shift_pattern           text,
  pay_rate                text,
  pay_basis               text,
  overtime                text,
  expenses                text,
  duties                  text,
  experience               text,
  qualifications          text,

  -- Driver / compliance requirements. Airtable stores each of the following
  -- as free text, not a checkbox. Raw value is preserved verbatim in the
  -- *_raw column; the boolean is a derived value populated by import when the
  -- raw text is an unambiguous yes/no, and left null otherwise pending manual
  -- review. No source value is discarded.
  licences                text[] not null default '{}',
  driving_licence         text,
  driver_cpc_raw          text,
  driver_cpc              boolean,
  tachograph_card_raw     text,
  tachograph_card         boolean,
  own_vehicle_raw         text,
  own_vehicle              boolean,
  health_safety_risks     text,
  risk_controls           text,
  ppe                     text,
  vulnerable_people_raw   text,
  vulnerable_people       boolean,
  dbs_required_raw        text,
  dbs_required            boolean,

  -- Employer declarations, captured at submission
  genuine_vacancy         boolean not null default false,
  authority_to_recruit    boolean not null default false,
  accurate_information    boolean not null default false,
  equality_confirmation   boolean not null default false,
  advert_authorised       boolean not null default false,
  -- Airtable stores Contact Authority as a single line of free text (for
  -- example a confirming name or phrase), not a checkbox. Kept as text so no
  -- source value is lost; a stricter boolean can be added later once the
  -- actual range of recorded values is confirmed.
  contact_authority       text,
  privacy_acknowledged    boolean not null default false,

  -- Operational
  source_site             text,
  source_page             text,
  status                  public.vandriver_vacancy_status not null default 'draft',
  -- Only for justified migration/debug traceability, never a substitute for
  -- the normalised columns above.
  raw_payload             jsonb,
  job_family              text,
  role_category           text,
  swift_service_area      text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint vandriver_vacancies_ref_unique unique (vacancy_ref),
  constraint vandriver_vacancies_positions_check check (positions > 0),
  constraint vandriver_vacancies_weekly_hours_check check (weekly_hours is null or weekly_hours >= 0),
  constraint vandriver_vacancies_plan_price_check check (plan_monthly_price is null or plan_monthly_price >= 0),
  constraint vandriver_vacancies_addon_total_check check (board_add_on_total is null or board_add_on_total >= 0),
  constraint vandriver_vacancies_quoted_total_check check (quoted_total is null or quoted_total >= 0)
);

create unique index vandriver_vacancies_legacy_ref_key
  on public.vandriver_vacancies (legacy_vacancy_ref)
  where legacy_vacancy_ref is not null;

create unique index vandriver_vacancies_legacy_wp_job_id_key
  on public.vandriver_vacancies (legacy_wp_job_id)
  where legacy_wp_job_id is not null;

create index vandriver_vacancies_client_idx on public.vandriver_vacancies (client_id);

create index vandriver_vacancies_status_idx on public.vandriver_vacancies (status);

comment on table public.vandriver_vacancies is
  'VanDriver.work employer vacancy, recruitment requirement and advertising request.';

comment on column public.vandriver_vacancies.raw_payload is
  'Raw source payload retained only for justified migration/debug purposes. Not a substitute for the normalised columns.';

comment on column public.vandriver_vacancies.start_date_raw is
  'Airtable Start Date raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.start_date is
  'Import transformation: parsed from start_date_raw when unambiguous; null otherwise pending manual review.';

comment on column public.vandriver_vacancies.weekly_hours_raw is
  'Airtable Weekly Hours raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.weekly_hours is
  'Import transformation: parsed numeric value from weekly_hours_raw when unambiguous; null otherwise.';

comment on column public.vandriver_vacancies.driver_cpc_raw is
  'Airtable Driver CPC raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.driver_cpc is
  'Import transformation: true/false when driver_cpc_raw is an unambiguous yes/no; null otherwise pending manual review.';

comment on column public.vandriver_vacancies.tachograph_card_raw is
  'Airtable Tachograph Card raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.tachograph_card is
  'Import transformation: true/false when tachograph_card_raw is an unambiguous yes/no; null otherwise.';

comment on column public.vandriver_vacancies.own_vehicle_raw is
  'Airtable Own Vehicle raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.own_vehicle is
  'Import transformation: true/false when own_vehicle_raw is an unambiguous yes/no; null otherwise.';

comment on column public.vandriver_vacancies.vulnerable_people_raw is
  'Airtable Vulnerable People raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.vulnerable_people is
  'Import transformation: true/false when vulnerable_people_raw is an unambiguous yes/no; null otherwise.';

comment on column public.vandriver_vacancies.dbs_required_raw is
  'Airtable DBS Required raw text value, preserved verbatim.';

comment on column public.vandriver_vacancies.dbs_required is
  'Import transformation: true/false when dbs_required_raw is an unambiguous yes/no; null otherwise.';

comment on column public.vandriver_vacancies.contact_authority is
  'Airtable Contact Authority raw single-line text, preserved verbatim. No stricter type is imposed pending confirmation of the recorded value range.';

-- 3.6 Applications --------------------------------------------------------------
-- Candidate-to-vacancy application pipeline.

create table public.vandriver_applications (
  id                          uuid primary key default gen_random_uuid(),
  application_ref             text not null,
  -- RESTRICT: application history must survive a candidate or vacancy being
  -- removed. Deletion of the underlying record is blocked while applications
  -- reference it; use a status transition instead.
  candidate_id                uuid not null references public.vandriver_candidates (id) on delete restrict,
  -- Nullable only for a general talent registration with no vacancy.
  vacancy_id                  uuid references public.vandriver_vacancies (id) on delete restrict,
  status                      public.vandriver_application_status not null default 'new',
  source                      text,
  internal_notes              text,
  applied_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  legacy_wp_application_id     text,
  legacy_wp_job_id             text,
  constraint vandriver_applications_ref_unique unique (application_ref)
);

-- Reapplication rule: a candidate may hold only ONE application to a given
-- vacancy that is not rejected/withdrawn at a time. 'hired' is treated as
-- terminal-but-blocking (deliberately included in the unique set, not
-- excluded) — a hired candidate should not be able to open a second
-- application against the same vacancy. Only 'rejected' and 'withdrawn' are
-- excluded from uniqueness, which is what allows reapplication after either.
create unique index vandriver_applications_active_candidate_vacancy_key
  on public.vandriver_applications (candidate_id, vacancy_id)
  where vacancy_id is not null
    and status <> all (array['rejected', 'withdrawn']::public.vandriver_application_status[]);

create index vandriver_applications_candidate_idx on public.vandriver_applications (candidate_id);

create index vandriver_applications_vacancy_idx on public.vandriver_applications (vacancy_id);

create index vandriver_applications_status_idx on public.vandriver_applications (status);

comment on table public.vandriver_applications is
  'Candidate-to-vacancy application pipeline. vacancy_id is nullable only for a general talent registration.';

-- 3.7 Advertising subscriptions -----------------------------------------------
-- Employer advertising subscription and vacancy allowance.
--
-- Commercial behaviour, chosen and enforced consistently:
--   * job_allowance and jobs_used_this_period are never negative.
--   * jobs_used_this_period MAY exceed job_allowance (billable overage); this
--     is a normal commercial state, not an error, and is flagged explicitly
--     by jobs_over_allowance rather than hidden inside a negative number.
--   * monthly_price is never negative.

create table public.vandriver_advertising_subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  subscriber_ref              text not null,
  -- RESTRICT: subscription/billing history must survive a client record being
  -- removed.
  client_id                   uuid not null references public.vandriver_clients (id) on delete restrict,
  advertising_plan            text not null,
  monthly_price               numeric(10, 2),
  job_allowance                integer not null default 0,
  jobs_used_this_period        integer not null default 0,
  -- Calculated rather than manually maintained, so it can never drift from
  -- the two figures it is derived from. May be negative, representing
  -- billable overage — see jobs_over_allowance.
  jobs_remaining               integer generated always as (job_allowance - jobs_used_this_period) stored,
  -- Explicit overage flag so a negative jobs_remaining is never ambiguous.
  jobs_over_allowance          boolean generated always as (jobs_used_this_period > job_allowance) stored,
  status                       public.vandriver_subscription_status not null default 'trial',
  start_date                   date,
  current_period_start         date,
  current_period_end           date,
  next_renewal_date            date,
  cancelled_date                date,
  payment_status                text,
  last_payment_date             date,
  next_payment_date             date,
  legacy_woo_subscription_id    text,
  legacy_woo_customer_id        text,
  legacy_woo_order_id           text,
  source_site                   text,
  notes                         text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint vandriver_advertising_subscriptions_ref_unique unique (subscriber_ref),
  constraint vandriver_advertising_subscriptions_allowance_check check (job_allowance >= 0),
  constraint vandriver_advertising_subscriptions_used_check check (jobs_used_this_period >= 0),
  constraint vandriver_advertising_subscriptions_price_check check (monthly_price is null or monthly_price >= 0)
);

create index vandriver_advertising_subscriptions_client_idx on public.vandriver_advertising_subscriptions (client_id);

create index vandriver_advertising_subscriptions_status_idx on public.vandriver_advertising_subscriptions (status);

comment on table public.vandriver_advertising_subscriptions is
  'Employer advertising subscription and vacancy allowance. jobs_remaining is generated, never manually maintained. Overage (jobs_used_this_period > job_allowance) is allowed and flagged explicitly.';

-- 3.8 Job board orders ---------------------------------------------------------
-- Optional premium/external job-board placements attached to a vacancy.
--
-- Commercial behaviour, chosen and enforced consistently: sell_price and
-- cost_price are never negative, but margin MAY be negative (a loss-making
-- placement is a real, legitimate business state, not a data error).

create table public.vandriver_job_board_orders (
  id                      uuid primary key default gen_random_uuid(),
  board_order_ref         text not null,
  -- RESTRICT: order/placement history must survive a vacancy being removed.
  vacancy_id              uuid not null references public.vandriver_vacancies (id) on delete restrict,
  job_board               text not null,
  included                boolean not null default false,
  sell_price              numeric(10, 2),
  cost_price              numeric(10, 2),
  -- Calculated rather than persisted as an independently editable value. May
  -- be negative — see commercial behaviour note above.
  margin                  numeric(10, 2) generated always as (coalesce(sell_price, 0) - coalesce(cost_price, 0)) stored,
  legacy_product_ref       text,
  status                  public.vandriver_job_board_order_status not null default 'pending',
  external_posting_ref     text,
  external_job_url         text,
  ordered_at               timestamptz,
  posted_at                timestamptz,
  expiry_date              date,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint vandriver_job_board_orders_ref_unique unique (board_order_ref),
  constraint vandriver_job_board_orders_sell_price_check check (sell_price is null or sell_price >= 0),
  constraint vandriver_job_board_orders_cost_price_check check (cost_price is null or cost_price >= 0)
);

create index vandriver_job_board_orders_vacancy_idx on public.vandriver_job_board_orders (vacancy_id);

create index vandriver_job_board_orders_status_idx on public.vandriver_job_board_orders (status);

comment on table public.vandriver_job_board_orders is
  'Premium/external job-board placements attached to a vacancy. margin is calculated and may be negative (a loss-making placement), never persisted independently.';

-- 3.9 Recruitment access --------------------------------------------------------
-- Explicit access for VanDriver recruiters, Swift personnel and later scoped
-- Recru.it/Nexus users. Access is NEVER inferred from Nexus company membership.
--
-- Scope semantics (see vandriver_security.has_active_grant for enforcement):
--   * both scopes null   -> whole VanDriver estate
--   * client_scope set   -> that client and all of its vacancies
--   * vacancy_scope set  -> ONLY that vacancy and its applicants; never the
--                           client record, subscriptions, or sibling vacancies

create table public.vandriver_recruitment_access (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  access_role    public.vandriver_access_role not null default 'viewer',
  -- At most one of client_scope / vacancy_scope is set. Both null means
  -- access across the whole VanDriver recruitment estate. A vacancy-scoped
  -- grant is intentionally NOT resolved up to its parent client anywhere in
  -- this migration — that resolution was the vacancy-scope escalation this
  -- migration corrects.
  client_scope   uuid references public.vandriver_clients (id) on delete cascade,
  vacancy_scope  uuid references public.vandriver_vacancies (id) on delete cascade,
  granted_at     timestamptz not null default now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid references public.profiles (id) on delete set null,
  granted_by     uuid references public.profiles (id) on delete set null,
  reason         text not null,
  constraint vandriver_recruitment_access_scope_exclusive
    check (client_scope is null or vacancy_scope is null),
  constraint vandriver_recruitment_access_expiry_after_grant
    check (expires_at is null or expires_at > granted_at)
);

create index vandriver_recruitment_access_profile_idx on public.vandriver_recruitment_access (profile_id);

create index vandriver_recruitment_access_client_idx
  on public.vandriver_recruitment_access (client_scope) where client_scope is not null;

create index vandriver_recruitment_access_vacancy_idx
  on public.vandriver_recruitment_access (vacancy_scope) where vacancy_scope is not null;

create index vandriver_recruitment_access_active_idx
  on public.vandriver_recruitment_access (profile_id) where revoked_at is null;

comment on table public.vandriver_recruitment_access is
  'Explicit, scoped, revocable VanDriver recruitment access. Never inferred from Nexus company membership. A vacancy-scoped grant reaches only that vacancy, never its client or siblings.';

-- 3.10 Audit log -----------------------------------------------------------------
-- Append-only. Follows the Nexus audit_events shape without coupling ownership
-- models — VanDriver access grants remain the sole authority for this table.
-- Material events (grant lifecycle, candidate/vacancy/application/client state
-- changes) are captured automatically by triggers in section 5, so audit
-- coverage does not depend on a client remembering to log anything.

create table public.vandriver_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  -- Records whether the actor exercised ordinary member access or explicit
  -- platform super-admin authority, so super-admin use is always visible.
  actor_authority   text not null default 'member' check (actor_authority in ('member', 'super_admin')),
  action            text not null,
  entity_type       text not null,
  entity_id         uuid,
  before_data       jsonb,
  after_data        jsonb,
  occurred_at       timestamptz not null default now(),
  reason            text
);

create index vandriver_audit_log_actor_idx on public.vandriver_audit_log (actor_profile_id, occurred_at desc);

create index vandriver_audit_log_entity_idx on public.vandriver_audit_log (entity_type, entity_id);

create index vandriver_audit_log_occurred_idx on public.vandriver_audit_log (occurred_at desc);

comment on table public.vandriver_audit_log is
  'Append-only audit trail for VanDriver recruitment access and state changes.';

-- ----------------------------------------------------------------------------
-- 4. Helper functions
--
-- Defined AFTER the tables they read and BEFORE the policies that call them.
-- All are SECURITY DEFINER with a pinned search_path, matching the nexus
-- schema convention, so policies can check access without recursing into a
-- table's own RLS policy.
-- ----------------------------------------------------------------------------

-- True while an active (unrevoked, unexpired) grant exists for the caller with
-- one of the required roles, matching the requested client/vacancy scope.
--
-- A grant with both scopes null is global across the whole recruitment estate.
-- A client-scoped grant reaches that client and (via can_access_vacancy /
-- can_manage_vacancy calling can_access_client / can_manage_client first)
-- every vacancy under it. A vacancy-scoped grant matches ONLY when the
-- specific vacancy being checked is that same vacancy — it is deliberately
-- NEVER resolved up to its parent client. Resolving a vacancy scope to its
-- client here was the original vacancy-scope privilege escalation: a
-- recruiter granted one vacancy could reach every sibling vacancy belonging
-- to the same client. That resolution has been removed.
create or replace function vandriver_security.has_active_grant(
  required_roles public.vandriver_access_role[],
  for_client_id uuid default null,
  for_vacancy_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.vandriver_recruitment_access a
    where a.profile_id = auth.uid()
      and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
      and a.access_role = any (required_roles)
      and (
        (a.client_scope is null and a.vacancy_scope is null)
        or (a.client_scope is not null and a.client_scope = for_client_id)
        or (a.vacancy_scope is not null and a.vacancy_scope = for_vacancy_id)
      )
  );
$$;

comment on function vandriver_security.has_active_grant(public.vandriver_access_role[], uuid, uuid) is
  'Core VanDriver access check. Global grant matches anything; client-scoped grant matches only that client; vacancy-scoped grant matches ONLY that exact vacancy — never resolved up to its client.';

-- Any active grant at all, regardless of role or scope. Used to let a
-- recruiter/viewer with a narrow (client- or vacancy-scoped) grant log a
-- manual audit note about their own authorised action, without requiring
-- global talent-pool access.
create or replace function vandriver_security.has_any_active_grant()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.vandriver_recruitment_access a
    where a.profile_id = auth.uid()
      and a.revoked_at is null
      and (a.expires_at is null or a.expires_at > now())
  );
$$;

create or replace function vandriver_security.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['viewer', 'recruiter', 'administrator']::public.vandriver_access_role[], target_client_id, null
       );
$$;

create or replace function vandriver_security.can_manage_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['recruiter', 'administrator']::public.vandriver_access_role[], target_client_id, null
       );
$$;

-- Deletion of master/history data is deliberately narrower than management:
-- 'recruiter' may manage but not delete. Only 'administrator' or a platform
-- super-admin may hard-delete.
create or replace function vandriver_security.can_delete_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['administrator']::public.vandriver_access_role[], target_client_id, null
       );
$$;

create or replace function vandriver_security.can_access_vacancy(target_client_id uuid, target_vacancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    vandriver_security.can_access_client(target_client_id)
    or vandriver_security.has_active_grant(
         array['viewer', 'recruiter', 'administrator']::public.vandriver_access_role[],
         target_client_id,
         target_vacancy_id
       );
$$;

create or replace function vandriver_security.can_manage_vacancy(target_client_id uuid, target_vacancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    vandriver_security.can_manage_client(target_client_id)
    or vandriver_security.has_active_grant(
         array['recruiter', 'administrator']::public.vandriver_access_role[],
         target_client_id,
         target_vacancy_id
       );
$$;

create or replace function vandriver_security.can_delete_vacancy(target_client_id uuid, target_vacancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    vandriver_security.can_delete_client(target_client_id)
    or vandriver_security.has_active_grant(
         array['administrator']::public.vandriver_access_role[],
         target_client_id,
         target_vacancy_id
       );
$$;

-- Only a global (unscoped) grant reaches the shared candidate pool, so a
-- client- or vacancy-scoped recruiter never sees candidates outside their
-- remit. Scoped recruiters instead use vandriver_security.vacancy_applicant_*
-- to see only the candidates who applied to their authorised vacancy.
create or replace function vandriver_security.can_access_talent_pool()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['viewer', 'recruiter', 'administrator']::public.vandriver_access_role[], null, null
       );
$$;

create or replace function vandriver_security.can_manage_talent_pool()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['recruiter', 'administrator']::public.vandriver_access_role[], null, null
       );
$$;

create or replace function vandriver_security.can_delete_talent_pool()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(
         array['administrator']::public.vandriver_access_role[], null, null
       );
$$;

create or replace function vandriver_security.is_candidate_self(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.vandriver_candidates c
    where c.id = target_candidate_id
      and c.auth_user_id = auth.uid()
  );
$$;

create or replace function vandriver_security.is_client_member(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.vandriver_client_users u
    where u.client_id = target_client_id
      and u.profile_id = auth.uid()
      and u.status = 'active'
  );
$$;

-- 'manager' membership is required to attempt a self-service update; 'viewer'
-- membership is read-only.
create or replace function vandriver_security.is_client_manager(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.vandriver_client_users u
    where u.client_id = target_client_id
      and u.profile_id = auth.uid()
      and u.status = 'active'
      and u.role = 'manager'
  );
$$;

-- Safe, deliberately narrow applicant visibility: returns only the candidates
-- who have actually applied to the given vacancy, and only to a caller
-- authorised for that vacancy (or an employer member of its client). This is
-- how a vacancy-scoped recruiter or employer sees applicant information
-- without ever gaining access to the wider VanDriver talent pool.
create or replace function vandriver_security.vacancy_applicant_candidates(target_vacancy_id uuid)
returns table (
  application_id      uuid,
  application_status  public.vandriver_application_status,
  applied_at          timestamptz,
  candidate_id        uuid,
  name                text,
  email               text,
  phone               text,
  postcode            text,
  driving_licence     text,
  own_van             boolean,
  van_type            text,
  experience          text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_client_id uuid;
begin
  select v.client_id into v_client_id from public.vandriver_vacancies v where v.id = target_vacancy_id;

  if v_client_id is null then
    return; -- vacancy does not exist: no rows, no error detail leaked
  end if;

  if not (
    vandriver_security.can_access_vacancy(v_client_id, target_vacancy_id)
    or vandriver_security.is_client_member(v_client_id)
  ) then
    raise exception 'not authorised to view applicants for this vacancy';
  end if;

  return query
    select a.id, a.status, a.applied_at,
           c.id, c.name, c.email, c.phone, c.postcode, c.driving_licence, c.own_van, c.van_type, c.experience
    from public.vandriver_applications a
    join public.vandriver_candidates c on c.id = a.candidate_id
    where a.vacancy_id = target_vacancy_id;
end;
$$;

comment on function vandriver_security.vacancy_applicant_candidates(uuid) is
  'Returns only candidates who applied to target_vacancy_id, to callers authorised for that vacancy. Never exposes the wider talent pool.';

-- Equivalent deliberate access rule for candidate documents: only documents
-- belonging to a candidate who applied to the authorised vacancy.
--
-- Document visibility is deliberately narrower than applicant visibility.
-- By default only 'cv' documents are returned — sensitive compliance
-- documents (right_to_work, driving_licence, dbs_certificate, other) are
-- withheld even from an authorised viewer, UNLESS that viewer holds an
-- explicit recruiter/administrator grant on this vacancy (can_manage_vacancy),
-- which is a deliberately broader, explicit distinction from mere vacancy/
-- employer visibility.
create or replace function vandriver_security.vacancy_applicant_documents(target_vacancy_id uuid)
returns table (
  candidate_id        uuid,
  document_id         uuid,
  document_type       public.vandriver_document_type,
  storage_object_key  text,
  original_filename   text,
  uploaded_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_client_id uuid;
  v_privileged boolean;
begin
  select v.client_id into v_client_id from public.vandriver_vacancies v where v.id = target_vacancy_id;

  if v_client_id is null then
    return;
  end if;

  if not (
    vandriver_security.can_access_vacancy(v_client_id, target_vacancy_id)
    or vandriver_security.is_client_member(v_client_id)
  ) then
    raise exception 'not authorised to view applicant documents for this vacancy';
  end if;

  -- Explicit, not implicit: only a recruiter/administrator grant unlocks
  -- compliance documents. A plain viewer or employer member gets CVs only.
  v_privileged := vandriver_security.can_manage_vacancy(v_client_id, target_vacancy_id);

  return query
    select distinct d.candidate_id, d.id, d.document_type, d.storage_object_key, d.original_filename, d.uploaded_at
    from public.vandriver_candidate_documents d
    join public.vandriver_applications a on a.candidate_id = d.candidate_id
    where a.vacancy_id = target_vacancy_id
      and (v_privileged or d.document_type = 'cv');
end;
$$;

comment on function vandriver_security.vacancy_applicant_documents(uuid) is
  'Returns only documents for candidates who applied to target_vacancy_id. Defaults to CV only; compliance documents require an explicit recruiter/administrator grant on the vacancy.';

-- ----------------------------------------------------------------------------
-- Staff full-record projections.
--
-- Section 7 revokes SELECT on staff-only/commercially sensitive columns from
-- the "authenticated" role at the column level, so candidate self-service and
-- employer portal queries against the base tables can never return them —
-- this is enforced independently of RLS and cannot be bypassed by selecting
-- those columns directly. These functions are the deliberate, explicit route
-- back to the full record for staff who are authorised to see it.
-- ----------------------------------------------------------------------------

create or replace function vandriver_security.staff_candidate_record(target_candidate_id uuid)
returns setof public.vandriver_candidates
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not vandriver_security.can_access_talent_pool() then
    raise exception 'not authorised to view the full candidate record';
  end if;

  return query select * from public.vandriver_candidates where id = target_candidate_id;
end;
$$;

create or replace function vandriver_security.staff_client_record(target_client_id uuid)
returns setof public.vandriver_clients
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not vandriver_security.can_access_client(target_client_id) then
    raise exception 'not authorised to view the full client record';
  end if;

  return query select * from public.vandriver_clients where id = target_client_id;
end;
$$;

create or replace function vandriver_security.staff_vacancy_record(target_vacancy_id uuid)
returns setof public.vandriver_vacancies
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.vandriver_vacancies where id = target_vacancy_id;

  if v_client_id is null or not vandriver_security.can_access_vacancy(v_client_id, target_vacancy_id) then
    raise exception 'not authorised to view the full vacancy record';
  end if;

  return query select * from public.vandriver_vacancies where id = target_vacancy_id;
end;
$$;

create or replace function vandriver_security.staff_application_record(target_application_id uuid)
returns setof public.vandriver_applications
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_vacancy_id uuid;
  v_client_id uuid;
  v_authorised boolean;
begin
  select vacancy_id into v_vacancy_id from public.vandriver_applications where id = target_application_id;

  if v_vacancy_id is null then
    v_authorised := vandriver_security.can_access_talent_pool();
  else
    select client_id into v_client_id from public.vandriver_vacancies where id = v_vacancy_id;
    v_authorised := v_client_id is not null and vandriver_security.can_access_vacancy(v_client_id, v_vacancy_id);
  end if;

  if not v_authorised then
    raise exception 'not authorised to view the full application record';
  end if;

  return query select * from public.vandriver_applications where id = target_application_id;
end;
$$;

create or replace function vandriver_security.staff_job_board_order_record(target_order_id uuid)
returns setof public.vandriver_job_board_orders
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_vacancy_id uuid;
  v_client_id uuid;
begin
  select vacancy_id into v_vacancy_id from public.vandriver_job_board_orders where id = target_order_id;

  if v_vacancy_id is null then
    raise exception 'not authorised to view the full job board order record';
  end if;

  select client_id into v_client_id from public.vandriver_vacancies where id = v_vacancy_id;

  if v_client_id is null or not vandriver_security.can_access_vacancy(v_client_id, v_vacancy_id) then
    raise exception 'not authorised to view the full job board order record';
  end if;

  return query select * from public.vandriver_job_board_orders where id = target_order_id;
end;
$$;

create or replace function vandriver_security.staff_advertising_subscription_record(target_subscription_id uuid)
returns setof public.vandriver_advertising_subscriptions
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.vandriver_advertising_subscriptions where id = target_subscription_id;

  if v_client_id is null or not vandriver_security.can_access_client(v_client_id) then
    raise exception 'not authorised to view the full advertising subscription record';
  end if;

  return query select * from public.vandriver_advertising_subscriptions where id = target_subscription_id;
end;
$$;

-- Column-level guard for candidate self-service updates. RLS decides whether
-- an update may be attempted at all; this trigger decides which columns a
-- non-staff caller (the candidate themselves) may actually change, which RLS
-- alone cannot express.
create or replace function vandriver_security.enforce_candidate_self_service_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if vandriver_security.can_manage_talent_pool() then
    return new; -- staff may change any column
  end if;

  if new.candidate_ref is distinct from old.candidate_ref
     or new.legacy_candidate_ref is distinct from old.legacy_candidate_ref
     or new.auth_user_id is distinct from old.auth_user_id
     or new.status is distinct from old.status
     or new.source is distinct from old.source
     or new.internal_notes is distinct from old.internal_notes
     or new.registered_at is distinct from old.registered_at
     or new.candidate_type is distinct from old.candidate_type
     or new.swift_local_area is distinct from old.swift_local_area
  then
    raise exception 'candidates may not self-edit staff-controlled fields (status, internal_notes, source, candidate_ref, legacy_candidate_ref, candidate_type, swift_local_area, auth_user_id)';
  end if;

  return new;
end;
$$;

-- Column-level guard for employer self-service updates, mirroring the
-- candidate guard above.
create or replace function vandriver_security.enforce_client_self_service_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if vandriver_security.can_manage_client(old.id) then
    return new; -- staff may change any column
  end if;

  if new.client_status is distinct from old.client_status
     or new.internal_notes is distinct from old.internal_notes
     or new.source_site is distinct from old.source_site
     or new.legacy_client_ref is distinct from old.legacy_client_ref
     or new.company_number is distinct from old.company_number
     or new.company_name is distinct from old.company_name
     or new.trading_name is distinct from old.trading_name
     or new.created_at is distinct from old.created_at
  then
    raise exception 'employer portal users may not self-edit staff-controlled fields (client_status, internal_notes, source_site, legacy_client_ref, company_number, company_name, trading_name)';
  end if;

  return new;
end;
$$;

-- Automatic, unavoidable audit coverage for recruitment access grant
-- lifecycle events. Runs as SECURITY DEFINER so a scoped recruiter/employer
-- action still produces a legitimate audit row without needing global
-- talent-pool access purely to write to vandriver_audit_log.
create or replace function vandriver_security.audit_recruitment_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'grant_created';
  elsif new.revoked_at is not null and old.revoked_at is null then
    v_action := 'grant_revoked';
  elsif new.expires_at is distinct from old.expires_at
     or new.access_role is distinct from old.access_role
     or new.client_scope is distinct from old.client_scope
     or new.vacancy_scope is distinct from old.vacancy_scope then
    v_action := 'grant_modified';
  else
    return new;
  end if;

  insert into public.vandriver_audit_log
    (actor_profile_id, actor_authority, action, entity_type, entity_id, before_data, after_data, reason)
  values (
    auth.uid(),
    case when nexus.is_platform_super_admin() then 'super_admin' else 'member' end,
    v_action,
    'recruitment_access',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    new.reason
  );
  return new;
end;
$$;

create or replace function vandriver_security.audit_candidate_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status is distinct from old.status then
    insert into public.vandriver_audit_log (actor_profile_id, actor_authority, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(),
      case when nexus.is_platform_super_admin() then 'super_admin' else 'member' end,
      'candidate_status_changed',
      'candidate',
      new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function vandriver_security.audit_vacancy_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status is distinct from old.status then
    insert into public.vandriver_audit_log (actor_profile_id, actor_authority, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(),
      case when nexus.is_platform_super_admin() then 'super_admin' else 'member' end,
      'vacancy_status_changed',
      'vacancy',
      new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function vandriver_security.audit_application_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status is distinct from old.status then
    insert into public.vandriver_audit_log (actor_profile_id, actor_authority, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(),
      case when nexus.is_platform_super_admin() then 'super_admin' else 'member' end,
      'application_status_changed',
      'application',
      new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function vandriver_security.audit_client_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.client_status is distinct from old.client_status then
    insert into public.vandriver_audit_log (actor_profile_id, actor_authority, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(),
      case when nexus.is_platform_super_admin() then 'super_admin' else 'member' end,
      'client_status_changed',
      'client',
      new.id,
      jsonb_build_object('client_status', old.client_status),
      jsonb_build_object('client_status', new.client_status)
    );
  end if;
  return new;
end;
$$;

create or replace function vandriver_security.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'vandriver_audit_log is append-only';
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Triggers
-- ----------------------------------------------------------------------------

-- Reuses the generic nexus.set_updated_at() utility (no tenancy coupling —
-- it only sets new.updated_at = now()).
create trigger vandriver_clients_set_updated_at
  before update on public.vandriver_clients
  for each row execute function nexus.set_updated_at();

create trigger vandriver_client_users_set_updated_at
  before update on public.vandriver_client_users
  for each row execute function nexus.set_updated_at();

create trigger vandriver_candidates_set_updated_at
  before update on public.vandriver_candidates
  for each row execute function nexus.set_updated_at();

create trigger vandriver_vacancies_set_updated_at
  before update on public.vandriver_vacancies
  for each row execute function nexus.set_updated_at();

create trigger vandriver_applications_set_updated_at
  before update on public.vandriver_applications
  for each row execute function nexus.set_updated_at();

create trigger vandriver_advertising_subscriptions_set_updated_at
  before update on public.vandriver_advertising_subscriptions
  for each row execute function nexus.set_updated_at();

create trigger vandriver_job_board_orders_set_updated_at
  before update on public.vandriver_job_board_orders
  for each row execute function nexus.set_updated_at();

-- Column-level self-service guards. Must run on every update, not only
-- self-service ones — the trigger itself decides whether the caller is staff.
create trigger vandriver_clients_enforce_self_service_columns
  before update on public.vandriver_clients
  for each row execute function vandriver_security.enforce_client_self_service_columns();

create trigger vandriver_candidates_enforce_self_service_columns
  before update on public.vandriver_candidates
  for each row execute function vandriver_security.enforce_candidate_self_service_columns();

-- Automatic audit coverage for material state changes. AFTER triggers so the
-- committed new values are captured; SECURITY DEFINER so scoped/self-service
-- actors still produce a legitimate audit row.
create trigger vandriver_recruitment_access_audit
  after insert or update on public.vandriver_recruitment_access
  for each row execute function vandriver_security.audit_recruitment_access();

create trigger vandriver_candidates_audit
  after update on public.vandriver_candidates
  for each row execute function vandriver_security.audit_candidate_status();

create trigger vandriver_vacancies_audit
  after update on public.vandriver_vacancies
  for each row execute function vandriver_security.audit_vacancy_status();

create trigger vandriver_applications_audit
  after update on public.vandriver_applications
  for each row execute function vandriver_security.audit_application_status();

create trigger vandriver_clients_audit
  after update on public.vandriver_clients
  for each row execute function vandriver_security.audit_client_status();

create trigger vandriver_audit_log_prevent_mutation
  before update or delete on public.vandriver_audit_log
  for each row execute function vandriver_security.prevent_audit_log_mutation();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.vandriver_clients                   enable row level security;

alter table public.vandriver_client_users               enable row level security;

alter table public.vandriver_candidates                 enable row level security;

alter table public.vandriver_candidate_documents        enable row level security;

alter table public.vandriver_vacancies                  enable row level security;

alter table public.vandriver_applications               enable row level security;

alter table public.vandriver_advertising_subscriptions   enable row level security;

alter table public.vandriver_job_board_orders            enable row level security;

alter table public.vandriver_recruitment_access          enable row level security;

alter table public.vandriver_audit_log                   enable row level security;

-- 6.1 Clients --------------------------------------------------------------
-- A global (unscoped) grant satisfies can_manage_client() for a brand new
-- row too, because the global branch of has_active_grant() does not require
-- an id match — this is what lets recruiters create new clients. Deletion is
-- narrower than management: only 'administrator' or super-admin may hard
-- delete (see can_delete_client) — normal deactivation is a client_status
-- transition to 'archived', not row deletion.

create policy vandriver_clients_select on public.vandriver_clients
  for select to authenticated
  using (vandriver_security.can_access_client(id) or vandriver_security.is_client_member(id));

create policy vandriver_clients_insert on public.vandriver_clients
  for insert to authenticated
  with check (vandriver_security.can_manage_client(id));

-- Row-level check only permits the attempt; enforce_client_self_service_columns
-- restricts which columns a manager (non-staff) may actually change.
create policy vandriver_clients_update on public.vandriver_clients
  for update to authenticated
  using (vandriver_security.can_manage_client(id) or vandriver_security.is_client_manager(id))
  with check (vandriver_security.can_manage_client(id) or vandriver_security.is_client_manager(id));

create policy vandriver_clients_delete on public.vandriver_clients
  for delete to authenticated
  using (vandriver_security.can_delete_client(id));

-- 6.2 Client portal membership -------------------------------------------------
-- Membership is staff-provisioned only — an employer cannot grant themselves
-- or a colleague access, which would be a self-service escalation.

create policy vandriver_client_users_select on public.vandriver_client_users
  for select to authenticated
  using (profile_id = auth.uid() or vandriver_security.can_access_client(client_id));

create policy vandriver_client_users_write on public.vandriver_client_users
  for all to authenticated
  using (vandriver_security.can_manage_client(client_id))
  with check (vandriver_security.can_manage_client(client_id));

-- 6.3 Candidates -----------------------------------------------------------
-- Full-pool visibility requires an explicit global grant. Candidates always
-- see only their own record via auth_user_id. Deletion is administrator/
-- super-admin only (see can_delete_talent_pool) — normal deactivation is a
-- status transition to 'inactive'/'archived', not row deletion.

create policy vandriver_candidates_select on public.vandriver_candidates
  for select to authenticated
  using (vandriver_security.can_access_talent_pool() or vandriver_security.is_candidate_self(id));

create policy vandriver_candidates_insert on public.vandriver_candidates
  for insert to authenticated
  with check (vandriver_security.can_manage_talent_pool());

-- Row-level check only permits the attempt; enforce_candidate_self_service_columns
-- restricts which columns a self-service candidate may actually change.
create policy vandriver_candidates_update on public.vandriver_candidates
  for update to authenticated
  using (vandriver_security.can_manage_talent_pool() or vandriver_security.is_candidate_self(id))
  with check (vandriver_security.can_manage_talent_pool() or vandriver_security.is_candidate_self(id));

create policy vandriver_candidates_delete on public.vandriver_candidates
  for delete to authenticated
  using (vandriver_security.can_delete_talent_pool());

-- 6.4 Candidate documents ----------------------------------------------------
-- Direct table access remains talent-pool/self only. A vacancy-scoped or
-- client-scoped recruiter/employer instead uses
-- vandriver_security.vacancy_applicant_documents(), which exposes only
-- documents belonging to candidates who applied to an authorised vacancy.

create policy vandriver_candidate_documents_select on public.vandriver_candidate_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.vandriver_candidates c
      where c.id = candidate_id
        and (vandriver_security.can_access_talent_pool() or c.auth_user_id = auth.uid())
    )
  );

create policy vandriver_candidate_documents_write on public.vandriver_candidate_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.vandriver_candidates c
      where c.id = candidate_id
        and (vandriver_security.can_manage_talent_pool() or c.auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.vandriver_candidates c
      where c.id = candidate_id
        and (vandriver_security.can_manage_talent_pool() or c.auth_user_id = auth.uid())
    )
  );

-- 6.5 Vacancies --------------------------------------------------------------
-- Employer members may read their own vacancy, but only recruiters/
-- administrators may create or change one, and only 'administrator'/
-- super-admin may hard delete one (see can_delete_vacancy).

create policy vandriver_vacancies_select on public.vandriver_vacancies
  for select to authenticated
  using (
    vandriver_security.can_access_vacancy(client_id, id)
    or vandriver_security.is_client_member(client_id)
  );

create policy vandriver_vacancies_insert on public.vandriver_vacancies
  for insert to authenticated
  with check (vandriver_security.can_manage_client(client_id));

create policy vandriver_vacancies_update on public.vandriver_vacancies
  for update to authenticated
  using (vandriver_security.can_manage_vacancy(client_id, id))
  with check (vandriver_security.can_manage_vacancy(client_id, id));

create policy vandriver_vacancies_delete on public.vandriver_vacancies
  for delete to authenticated
  using (vandriver_security.can_delete_vacancy(client_id, id));

-- 6.6 Applications -------------------------------------------------------------
-- A candidate sees their own applications. An employer member sees
-- applications against their own vacancy. General registrations (vacancy_id
-- null) require talent-pool access. Deletion is administrator/super-admin
-- only, matching the master-data retention policy in section 3.

create policy vandriver_applications_select on public.vandriver_applications
  for select to authenticated
  using (
    vandriver_security.is_candidate_self(candidate_id)
    or (
      vacancy_id is not null
      and exists (
        select 1 from public.vandriver_vacancies v
        where v.id = vacancy_id
          and (vandriver_security.can_access_vacancy(v.client_id, v.id) or vandriver_security.is_client_member(v.client_id))
      )
    )
    or (vacancy_id is null and vandriver_security.can_access_talent_pool())
  );

create policy vandriver_applications_insert on public.vandriver_applications
  for insert to authenticated
  with check (
    vandriver_security.can_manage_talent_pool()
    or (
      vacancy_id is not null
      and exists (
        select 1 from public.vandriver_vacancies v
        where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
      )
    )
  );

create policy vandriver_applications_update on public.vandriver_applications
  for update to authenticated
  using (
    vandriver_security.can_manage_talent_pool()
    or (
      vacancy_id is not null
      and exists (
        select 1 from public.vandriver_vacancies v
        where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
      )
    )
  )
  with check (
    vandriver_security.can_manage_talent_pool()
    or (
      vacancy_id is not null
      and exists (
        select 1 from public.vandriver_vacancies v
        where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
      )
    )
  );

create policy vandriver_applications_delete on public.vandriver_applications
  for delete to authenticated
  using (
    vandriver_security.can_delete_talent_pool()
    or (
      vacancy_id is not null
      and exists (
        select 1 from public.vandriver_vacancies v
        where v.id = vacancy_id and vandriver_security.can_delete_vacancy(v.client_id, v.id)
      )
    )
  );

-- 6.7 Advertising subscriptions -------------------------------------------------
-- Split into select / write(insert+update) / delete so hard deletion of
-- billing history can be restricted more tightly than ordinary management.

create policy vandriver_advertising_subscriptions_select on public.vandriver_advertising_subscriptions
  for select to authenticated
  using (
    vandriver_security.can_access_client(client_id)
    or vandriver_security.is_client_member(client_id)
  );

create policy vandriver_advertising_subscriptions_insert on public.vandriver_advertising_subscriptions
  for insert to authenticated
  with check (vandriver_security.can_manage_client(client_id));

create policy vandriver_advertising_subscriptions_update on public.vandriver_advertising_subscriptions
  for update to authenticated
  using (vandriver_security.can_manage_client(client_id))
  with check (vandriver_security.can_manage_client(client_id));

create policy vandriver_advertising_subscriptions_delete on public.vandriver_advertising_subscriptions
  for delete to authenticated
  using (vandriver_security.can_delete_client(client_id));

-- 6.8 Job board orders -----------------------------------------------------------
-- Split the same way as advertising subscriptions, for the same reason.

create policy vandriver_job_board_orders_select on public.vandriver_job_board_orders
  for select to authenticated
  using (
    exists (
      select 1 from public.vandriver_vacancies v
      where v.id = vacancy_id
        and (vandriver_security.can_access_vacancy(v.client_id, v.id) or vandriver_security.is_client_member(v.client_id))
    )
  );

create policy vandriver_job_board_orders_insert on public.vandriver_job_board_orders
  for insert to authenticated
  with check (
    exists (
      select 1 from public.vandriver_vacancies v
      where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
    )
  );

create policy vandriver_job_board_orders_update on public.vandriver_job_board_orders
  for update to authenticated
  using (
    exists (
      select 1 from public.vandriver_vacancies v
      where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
    )
  )
  with check (
    exists (
      select 1 from public.vandriver_vacancies v
      where v.id = vacancy_id and vandriver_security.can_manage_vacancy(v.client_id, v.id)
    )
  );

create policy vandriver_job_board_orders_delete on public.vandriver_job_board_orders
  for delete to authenticated
  using (
    exists (
      select 1 from public.vandriver_vacancies v
      where v.id = vacancy_id and vandriver_security.can_delete_vacancy(v.client_id, v.id)
    )
  );

-- 6.9 Recruitment access ----------------------------------------------------------
-- Readable by the grant holder, administrators and super-admins, so a grant
-- can never be exercised invisibly. Writes are service-role only (no policy
-- granted to authenticated) — access must be explicitly provisioned, never
-- self-service, matching the platform_super_admins convention in Migration 001.

create policy vandriver_recruitment_access_select on public.vandriver_recruitment_access
  for select to authenticated
  using (
    profile_id = auth.uid()
    or nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(array['administrator']::public.vandriver_access_role[], null, null)
  );

-- 6.10 Audit log ---------------------------------------------------------------
-- Append-only: no update or delete policy is granted. Most rows are written
-- automatically by the triggers in section 5, which bypass this policy as
-- SECURITY DEFINER. This policy covers manual/ad hoc entries: any authenticated
-- actor holding ANY active grant (any role, any scope) may log a note about
-- their own action, so a narrowly scoped recruiter is not forced to hold
-- global talent-pool access merely to record what they did.

create policy vandriver_audit_log_insert on public.vandriver_audit_log
  for insert to authenticated
  with check (
    actor_profile_id = auth.uid()
    and (nexus.is_platform_super_admin() or vandriver_security.has_any_active_grant())
  );

create policy vandriver_audit_log_select on public.vandriver_audit_log
  for select to authenticated
  using (
    nexus.is_platform_super_admin()
    or vandriver_security.has_active_grant(array['administrator']::public.vandriver_access_role[], null, null)
  );

-- ----------------------------------------------------------------------------
-- 7. Grants
--
-- Migration 001's blanket "grant all ... to service_role" only covered tables
-- that existed at the time it ran, so new tables need their own grants. RLS
-- still governs which rows are visible or writable.
-- ----------------------------------------------------------------------------

-- Tables with staff-only/commercially sensitive columns (clients, candidates,
-- applications, vacancies, advertising subscriptions, job board orders) are
-- deliberately NOT included in this blanket select grant. Postgres column
-- privileges are additive: once a role holds table-wide SELECT, no column-
-- level REVOKE can take it back for that role. So for those tables SELECT is
-- granted only on the explicit safe-column list below; sensitive columns are
-- simply never granted to "authenticated" at all, and are reachable only
-- through the vandriver_security.staff_*_record() SECURITY DEFINER functions.
grant select on
  public.vandriver_client_users,
  public.vandriver_candidate_documents,
  public.vandriver_recruitment_access,
  public.vandriver_audit_log
to authenticated;

-- Portal-safe column grants. Excludes: vandriver_clients.internal_notes,
-- legacy_client_ref, source_site; vandriver_candidates.internal_notes,
-- legacy_candidate_ref, source, candidate_type, swift_local_area;
-- vandriver_applications.internal_notes, legacy_wp_application_id,
-- legacy_wp_job_id; vandriver_vacancies.raw_payload, legacy_vacancy_ref,
-- legacy_wp_job_id, source_site, source_page;
-- vandriver_advertising_subscriptions.notes, legacy_woo_subscription_id,
-- legacy_woo_customer_id, legacy_woo_order_id, source_site;
-- vandriver_job_board_orders.cost_price, margin, legacy_product_ref, notes.

grant select (
  id, company_name, trading_name, company_number, nature_of_business, website, address,
  contact_name, contact_role, email, phone, client_status, created_at, updated_at
) on public.vandriver_clients to authenticated;

grant select (
  id, candidate_ref, auth_user_id, name, email, phone, postcode, driving_licence, own_van,
  van_type, work_wanted, travel_radius_raw, travel_radius_miles, availability, experience,
  talent_network_consent, status, registered_at, updated_at, roles_wanted, preferred_locations,
  employment_preference, working_pattern, manual_handling_experience, two_person_delivery_experience,
  warehouse_skills, flt_licence_type, transport_admin_skills, systems_experience
) on public.vandriver_candidates to authenticated;

grant select (
  id, application_ref, candidate_id, vacancy_id, status, source, applied_at, updated_at
) on public.vandriver_applications to authenticated;

grant select (
  id, vacancy_ref, client_id, employment_type, service_level, advertising_plan, plan_monthly_price,
  job_board_add_ons, board_add_on_total, quoted_total, job_title, positions, location,
  start_date_raw, start_date, duration, working_days, working_hours, weekly_hours_raw, weekly_hours,
  shift_pattern, pay_rate, pay_basis, overtime, expenses, duties, experience, qualifications,
  licences, driving_licence, driver_cpc_raw, driver_cpc, tachograph_card_raw, tachograph_card,
  own_vehicle_raw, own_vehicle, health_safety_risks, risk_controls, ppe, vulnerable_people_raw,
  vulnerable_people, dbs_required_raw, dbs_required, genuine_vacancy, authority_to_recruit,
  accurate_information, equality_confirmation, advert_authorised, contact_authority,
  privacy_acknowledged, status, job_family, role_category, swift_service_area, created_at, updated_at
) on public.vandriver_vacancies to authenticated;

grant select (
  id, subscriber_ref, client_id, advertising_plan, monthly_price, job_allowance, jobs_used_this_period,
  jobs_remaining, jobs_over_allowance, status, start_date, current_period_start, current_period_end,
  next_renewal_date, cancelled_date, payment_status, last_payment_date, next_payment_date,
  created_at, updated_at
) on public.vandriver_advertising_subscriptions to authenticated;

grant select (
  id, board_order_ref, vacancy_id, job_board, included, sell_price, status, external_posting_ref,
  external_job_url, ordered_at, posted_at, expiry_date, created_at, updated_at
) on public.vandriver_job_board_orders to authenticated;

grant insert, update, delete on
  public.vandriver_clients,
  public.vandriver_client_users,
  public.vandriver_candidates,
  public.vandriver_candidate_documents,
  public.vandriver_vacancies,
  public.vandriver_applications,
  public.vandriver_advertising_subscriptions,
  public.vandriver_job_board_orders
to authenticated;

-- vandriver_recruitment_access has no insert/update/delete grant for
-- authenticated: access grants are provisioned server-side only.
grant insert on public.vandriver_audit_log to authenticated;

grant all on
  public.vandriver_clients,
  public.vandriver_client_users,
  public.vandriver_candidates,
  public.vandriver_candidate_documents,
  public.vandriver_vacancies,
  public.vandriver_applications,
  public.vandriver_advertising_subscriptions,
  public.vandriver_job_board_orders,
  public.vandriver_recruitment_access,
  public.vandriver_audit_log
to service_role;

grant usage on schema vandriver_security to authenticated, service_role;

revoke execute on all functions in schema vandriver_security from public;

grant execute on function vandriver_security.has_active_grant(public.vandriver_access_role[], uuid, uuid)
  to authenticated, service_role;

grant execute on function vandriver_security.has_any_active_grant() to authenticated, service_role;

grant execute on function vandriver_security.can_access_client(uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_manage_client(uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_delete_client(uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_access_vacancy(uuid, uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_manage_vacancy(uuid, uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_delete_vacancy(uuid, uuid) to authenticated, service_role;

grant execute on function vandriver_security.can_access_talent_pool() to authenticated, service_role;

grant execute on function vandriver_security.can_manage_talent_pool() to authenticated, service_role;

grant execute on function vandriver_security.can_delete_talent_pool() to authenticated, service_role;

grant execute on function vandriver_security.is_candidate_self(uuid) to authenticated, service_role;

grant execute on function vandriver_security.is_client_member(uuid) to authenticated, service_role;

grant execute on function vandriver_security.is_client_manager(uuid) to authenticated, service_role;

grant execute on function vandriver_security.vacancy_applicant_candidates(uuid) to authenticated, service_role;

grant execute on function vandriver_security.vacancy_applicant_documents(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_candidate_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_client_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_vacancy_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_application_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_job_board_order_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.staff_advertising_subscription_record(uuid) to authenticated, service_role;

grant execute on function vandriver_security.enforce_candidate_self_service_columns() to service_role;

grant execute on function vandriver_security.enforce_client_self_service_columns() to service_role;

grant execute on function vandriver_security.audit_recruitment_access() to service_role;

grant execute on function vandriver_security.audit_candidate_status() to service_role;

grant execute on function vandriver_security.audit_vacancy_status() to service_role;

grant execute on function vandriver_security.audit_application_status() to service_role;

grant execute on function vandriver_security.audit_client_status() to service_role;

grant execute on function vandriver_security.prevent_audit_log_mutation() to service_role;

-- ----------------------------------------------------------------------------
-- Column-level privacy for staff-only/commercially sensitive fields.
--
-- RLS is row-level only, so it cannot stop an authorised viewer (a candidate
-- reading their own row, or an employer portal member reading their own
-- client/vacancy/application/job-board rows) from selecting a column that
-- should stay staff-only. This is why the sensitive columns above were never
-- granted to "authenticated" in the first place (see the column-level grants
-- earlier in this section) rather than granted then revoked — Postgres
-- column privileges are additive, so a table-wide SELECT grant cannot be
-- narrowed afterwards by revoking individual columns from the same role.
-- The vandriver_security.staff_*_record() functions are the deliberate,
-- explicit route back to the full record for authorised staff.
-- ----------------------------------------------------------------------------;
