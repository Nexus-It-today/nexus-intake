# Production database baseline

Last reconciled: 2026-08-29

## Canonical production database

Supabase project: `Nexusit_today` (`qfwswkmueiidpdgigzko`), region `eu-west-2`.

The live production project was created on 2026-08-15 and currently reports the following migration history:

1. `20260815212348_foundation_tenancy`
2. `20260816103000_vandriver_recruitment_foundation`
3. `20260822173924_message_it_foundation`
4. `20260822180642_message_it_privilege_hardening`
5. `20260828190000_track_it_capture_foundation`
6. `20260829081208_harden_track_it_capture_table_grants`

## Important reconciliation rule

The legacy migration chain currently stored under `supabase/migrations/` predates this production project and must **not** be assumed to reproduce the current production database from an empty database.

Do not run the legacy chain against production and do not mark legacy migration versions as applied merely to make migration history look aligned.

Before any future production DDL change:

- capture the exact production migration SQL in source control;
- test reconstruction against a clean non-production database;
- compare tables, constraints, indexes, functions, grants and RLS policies with production;
- only then establish a new canonical migration baseline for future changes.

## Current production security state checked 2026-08-29

- All current public tables have RLS enabled.
- Message it and Track it operational tables use forced RLS where intended.
- `merchants.company_id` is the canonical merchant ownership boundary.
- Track it capture tables are read-only to browser-facing roles; writes are performed by the capture RPC.
- `capture_trackpod_prepared_batch(jsonb)` is `SECURITY DEFINER`, checks `auth.uid()` and requires an unrevoked `platform_super_admins` grant before writing.

## Outstanding platform configuration

Supabase Auth leaked-password protection is currently disabled and should be enabled in the production Auth configuration.

## Release rule

GitHub `main` is the application source of truth. Database changes must never again be made only in the live Supabase project: every production migration must have a matching committed migration before or as part of release.