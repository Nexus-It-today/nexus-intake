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

All six production migrations are now recovered into this directory:

- `20260815212348_foundation_tenancy.sql`
- `20260816103000_vandriver_recruitment_foundation.sql`
- `20260822173924_message_it_foundation.sql`
- `20260822180642_message_it_privilege_hardening.sql`
- `20260828190000_track_it_capture_foundation.sql`
- `20260829081208_harden_track_it_capture_table_grants.sql`

The four previously missing foundation files were reconstructed directly from `supabase_migrations.schema_migrations.statements` in the live production project. Their expected Git blob SHA-1 values were calculated independently from the authoritative production content and matched the GitHub blob SHA values exactly:

- `20260815212348_foundation_tenancy.sql` — `ce9c687aa76309b0f68755f30376379c71da6880`
- `20260816103000_vandriver_recruitment_foundation.sql` — `eaa027cb8fb5e5e610c2e1eb4fbf3763356cf6bf`
- `20260822173924_message_it_foundation.sql` — `6e725ad927ef350234e78210b0c7a5f88836de4b`
- `20260828190000_track_it_capture_foundation.sql` — `405db26d574311f9ab7113753eb56e541fa8f574`

This proves the recovered foundation content in GitHub is byte-for-byte identical to the canonical content reconstructed from the production migration ledger.

## Safety rule

Do not apply files in this directory to the existing production project. Production already records these versions as applied. Any new production database change must be a new forward migration, committed first, tested away from production, and only then applied.

## Track-POD security note

`public.capture_trackpod_prepared_batch(jsonb)` is currently `SECURITY DEFINER`, executable by `authenticated`, and performs an internal unrevoked platform-super-admin check. Current application source contains no caller for this RPC, and the recent API logs show no normal application invocation. Do not revoke its current execution grant until the capture path is deliberately moved behind a server-side Nexus route; otherwise a non-repository/manual capture path could be broken.
