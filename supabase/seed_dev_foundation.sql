-- =============================================================================
-- DEV / TEST SEED DATA ONLY - DO NOT RUN AGAINST A PRODUCTION DATABASE.
--
-- Seeds two clearly-fictional example organisations and merchants for local
-- development of Sprint 1 "Foundation it". Nothing here represents a real
-- customer - NDT, THDG, CTNI and any other real tenant must never be
-- hard-coded, including in seed data.
--
-- Run manually against a LOCAL Supabase instance only, e.g.:
--   supabase db reset && psql "$LOCAL_DB_URL" -f supabase/seed_dev_foundation.sql
-- =============================================================================

INSERT INTO public.organisations (slug, name, trading_name, status, source_system)
VALUES
  ('example-organisation', 'Example Organisation Ltd', 'Example Organisation', 'active', 'dev-seed'),
  ('sample-logistics-group', 'Sample Logistics Group Ltd', NULL, 'active', 'dev-seed')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.companies (id, organisation_id, name, trading_name, status, source_system)
SELECT o.id, o.id, o.name, o.trading_name, o.status, 'dev-seed'
FROM public.organisations o
WHERE o.slug IN ('example-organisation', 'sample-logistics-group')
ON CONFLICT (id) DO UPDATE
SET organisation_id = EXCLUDED.organisation_id,
    name = EXCLUDED.name,
    trading_name = EXCLUDED.trading_name,
    status = EXCLUDED.status,
    source_system = EXCLUDED.source_system;

INSERT INTO public.merchants (company_id, name, trading_name, status)
SELECT o.id, 'Example Merchant Co', 'Example Merchant', 'active'
FROM public.organisations o
WHERE o.slug = 'example-organisation'
ON CONFLICT DO NOTHING;

INSERT INTO public.merchants (company_id, name, trading_name, status)
SELECT o.id, 'Sample Retail Merchant', NULL, 'active'
FROM public.organisations o
WHERE o.slug = 'sample-logistics-group'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Memberships are intentionally NOT seeded here: organisation_memberships and
-- merchant_memberships both require a real row in auth.users (FK constraint),
-- which only exists once a user has actually signed up. To create dev
-- memberships:
--
--   1. Sign up (or supabase auth admin invite) a local dev user.
--   2. Sign in as a nexus_super_admin (or use the Create it -> Invite flows
--      in the app) to assign that user an organisation_owner /
--      organisation_admin / merchant_owner / merchant_admin role against one
--      of the example tenants seeded above.
--
-- This keeps membership seeding tied to real, auditable app flows instead of
-- a script that could silently drift from the auth.users table.
-- ---------------------------------------------------------------------------
