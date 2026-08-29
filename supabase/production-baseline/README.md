# Canonical production baseline

This directory records the migration history already applied to the live `Nexusit_today` Supabase project. It is **source-control recovery material**, not a second executable migration chain.

## Production migration order

1. `20260815212348_foundation_tenancy`
2. `20260816103000_vandriver_recruitment_foundation`
3. `20260822173924_message_it_foundation`
4. `20260822180642_message_it_privilege_hardening`
5. `20260828190000_track_it_capture_foundation`
6. `20260829081208_harden_track_it_capture_table_grants`

The legacy files under `supabase/migrations/` pre-date the current production project and must not be replayed against production simply to make the histories look alike.

## Recovery status

Recovered into this directory:

- `20260822180642_message_it_privilege_hardening.sql`
- `20260829081208_harden_track_it_capture_table_grants.sql`

The original SQL bodies for the four foundation migrations remain stored in `supabase_migrations.schema_migrations.statements` in production and have been verified retrievable. They must be copied verbatim before this baseline is declared complete:

- `20260815212348_foundation_tenancy.sql`
- `20260816103000_vandriver_recruitment_foundation.sql`
- `20260822173924_message_it_foundation.sql`
- `20260828190000_track_it_capture_foundation.sql`

## Safety rule

Do not apply files in this directory to the existing production project. Production already records these versions as applied. Any new production database change must be a new forward migration, committed first, tested away from production, and only then applied.

## Track-POD security note

`public.capture_trackpod_prepared_batch(jsonb)` is currently `SECURITY DEFINER`, executable by `authenticated`, and performs an internal unrevoked platform-super-admin check. Current application source contains no caller for this RPC, and the recent API logs show no normal application invocation. Do not revoke its current execution grant until the capture path is deliberately moved behind a server-side Nexus route; otherwise a non-repository/manual capture path could be broken.
