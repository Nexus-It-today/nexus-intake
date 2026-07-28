# Nexus It Platform 1.0 — Architecture

Sprint 1: "Foundation it". This document describes the canonical foundation
built in this sprint: tenancy, identity, permissions, the "Working as" context
switcher, branding, and the application shell every future "it" module will
sit on top of. It does not describe Catalogue it, Book it, payments,
Track-POD, Xero, Square, Stripe, Make, or WordPress integrations — those are
explicitly out of scope for this sprint and build on top of what is described
here.

---

## 1. Product principles

- **Nexus it is the software provider.** Every customer is a tenant
  (organisation), never a hard-coded name in application code, schema, or
  seed data. NDT, THDG and CTNI (and any other real customer) are ordinary
  organisations created through Create it — nothing about them is special-
  cased anywhere in this codebase.
- **Every meaningful action is an "it".** The product should always be able
  to answer "what do you want to Nexus it today?" — Create it, Brand it,
  Manage it, Audit it, and (in future sprints) Book it, Catalogue it,
  Track it, Invoice it, and so on. Foundation it is the first "it": the
  substrate every later one depends on.
- **One canonical model per concern.** Before this sprint, the repository had
  accumulated multiple, only-partially-overlapping models for tenancy
  (`company_id` vs `organisation_id`), identity (`profiles`, `organisation_users`,
  `customer_portal_users`), and authorization (`user_roles`/`permissions` vs a
  single `profiles.role` string). This sprint establishes one canonical model
  for each concern going forward, without deleting the legacy tables the
  existing operational modules (Process it, Document it, Catalogue it, etc.)
  still depend on. See §10 for how the two eras coexist and §20 for how later
  sprints finish the migration.

## 2. Canonical tenancy model

```
Nexus it
  -> organisations        (tenant root — a customer organisation)
       -> merchants        (a business the organisation operates)
            -> users        (via merchant_memberships)
       -> users             (via organisation_memberships)
```

- **`organisations`** is the tenant root. It already existed
  (`20260706103000_organisation_foundation.sql`) and is reused as-is —
  `id`, `slug`, `name`, `trading_name`, `status` (`active`/`suspended`/`archived`),
  timestamps.
- **`merchants`** is new this sprint
  (`20260727090000_foundation_merchants.sql`). Every merchant has exactly one
  `organisation_id` (`NOT NULL`, `ON DELETE CASCADE`) and its own
  `active`/`suspended`/`archived` status. An organisation may have zero, one,
  or many merchants.
- Nothing is hard-coded: organisations and merchants are created only through
  `POST /api/platform/organisations` and
  `POST /api/platform/organisations/:id/merchants`, both gated to the
  appropriate role (see §5).
- Archiving is a status change (`PATCH .../:id { status: "archived" }`), never
  a `DELETE`. Neither `organisations` nor `merchants` has a `DELETE` RLS
  policy or a DELETE API route — hard deletion of tenant records isn't
  possible through the app.
- Future operational records (in later sprints) carry `organisation_id`, and
  merchant-owned records additionally carry `merchant_id`, exactly as the
  brief specifies. This sprint does not retrofit that onto existing
  operational tables (`draft_jobs`, `merchant_catalogue_items`, etc.) — see
  §10 and §17.

## 3. Canonical identity model

Supabase Auth (`auth.users`) is the only authentication source. On top of it:

- **`profiles`** — unchanged this sprint, one row per `auth.users` row,
  carries `company_id`/`organisation_id` and a legacy `role` string. Still
  read by pre-existing operational code (`serverAuth.ts`, `customerAuth.ts`,
  the legacy `AppShell`/`AuthGate`). Foundation it does not read or write
  `profiles.role` for any of its own authorization decisions.
- **No new parallel identity table was introduced.** The brief asked for one
  canonical user model based on `auth.users` + `profiles`, and for membership
  tables instead of duplicated identities. `customer_portal_users` (a
  merchant's own customers logging into a customer portal) and
  `organisation_users` (the prior tenant-membership bolt-on) already exist;
  neither is removed this sprint because operational code and database
  triggers still depend on them (see §10 for why a hard removal now would be
  unsafe), but neither is used by any new Foundation it code either. They are
  marked ARCHIVE in §17 for a follow-up sprint once nothing reads them.
- A user's *only* representation in the new foundation is: an `auth.users` row,
  plus zero or more `organisation_memberships` rows, plus zero or more
  `merchant_memberships` rows. There is no second "app user" record to keep in
  sync.

## 4. Membership model

Two new tables (`20260727091000_foundation_memberships.sql`):

- **`organisation_memberships`**: `(organisation_id, user_id)` unique,
  `role` ∈ `organisation_owner | organisation_admin | organisation_operator | organisation_viewer`,
  `status` ∈ `active | invited | suspended`.
- **`merchant_memberships`**: `(merchant_id, user_id)` unique,
  `role` ∈ `merchant_owner | merchant_admin | merchant_operator | merchant_viewer`,
  `status` ∈ `active | invited | suspended`.

This directly satisfies the brief's hierarchy rules:

- A user may belong to more than one organisation (multiple
  `organisation_memberships` rows, one per organisation).
- A user may belong to more than one merchant, across different
  organisations (multiple `merchant_memberships` rows).
- A user may have a different role in each context — role lives on the
  membership row, never on the user or the profile.
- Merchant data always belongs to an organisation (`merchants.organisation_id`
  is `NOT NULL`); a merchant membership does not imply organisation
  membership, and vice versa (an organisation admin can manage a merchant
  under their organisation without an explicit `merchant_memberships` row,
  via the role-inheritance rule in §5 — but that is a permission check, not
  an identity merge).

Invites (`POST .../memberships`) use
`supabase.auth.admin.inviteUserByEmail()` (creating the `auth.users` row and
emailing an invite link if the user doesn't exist yet) and set the new
membership row to `status = "invited"`; if the email already belongs to an
existing user, the membership is created as `status = "active"` immediately.
See `src/lib/platform/inviteUser.ts`.

## 5. Role and permission matrix

**Platform level** (reuses the existing `roles`/`permissions`/`user_roles`
system from `manage_it_permissions.sql` rather than a new table — see §17 for
why):

| Role | Access |
|---|---|
| `nexus_super_admin` | Every permission; implicitly a member of every organisation and merchant (no membership row needed). |
| `nexus_support` | Read-only platform-wide visibility (`platform:support_access` + the existing `manage:*:view` permissions). |

**Organisation level** (`organisation_memberships.role`):

| Role | Can manage org (edit/archive, invite/remove members, branding) | Can create/manage merchants | Read access |
|---|---|---|---|
| `organisation_owner` | Yes | Yes | Yes |
| `organisation_admin` | Yes | Yes | Yes |
| `organisation_operator` | No | No | Yes |
| `organisation_viewer` | No | No | Yes |

**Merchant level** (`merchant_memberships.role`):

| Role | Can manage merchant (edit/archive, invite/remove members, branding if allowed) | Read access |
|---|---|---|
| `merchant_owner` | Yes | Yes |
| `merchant_admin` | Yes | Yes |
| `merchant_operator` | No | Yes |
| `merchant_viewer` | No | Yes |

**Inheritance rule**: an `organisation_owner`/`organisation_admin` can manage
every merchant under their organisation without a separate merchant
membership row (`can_manage_merchant()` checks the parent organisation's role
as a fallback). A `merchant_owner`/`merchant_admin` cannot manage anything
outside their own merchant, and cannot see sibling merchants under the same
organisation unless they also hold an organisation-level role.

This is enforced twice, independently:
- **Database**: `has_organisation_role()`, `has_merchant_role()`,
  `can_access_organisation()`, `can_manage_organisation()`,
  `can_access_merchant()`, `can_manage_merchant()` SQL functions, used both by
  RLS policies and available to be called directly.
- **Application**: `src/lib/platform/permissions.ts` mirrors the same logic
  in TypeScript, because API routes use the service-role client (which
  bypasses RLS) for writes — the RLS policies are a second, independent
  backstop for any query issued with a user-scoped client, not the only line
  of defence.

## 6. Working-as context model

The header's "Working as" switcher lets a user move between every
organisation and merchant they belong to (or, for platform admins, every
tenant on the platform, without needing an explicit membership row).

**Server-side flow** (`src/lib/platform/accessProfile.ts`,
`src/lib/platform/context.ts`):

1. `GET /api/platform/access-profile` (or `/context`) verifies the caller's
   bearer token against Supabase Auth, then queries
   `organisation_memberships` and `merchant_memberships` for that exact
   `user_id` (or, if the user is a platform admin, every organisation and
   merchant) — this is the **only** source of truth for what the switcher can
   offer.
2. The client's requested context (`{ type, id }`, read from a cookie or an
   explicit switch request) is passed to `resolveActiveContext()`, which
   checks it against the server-derived list from step 1. **Anything not in
   that list is ignored** and the user falls back to their first available
   organisation, then merchant, then bare platform context.
3. `POST /api/platform/context` re-runs steps 1–2 before writing the
   `nexus-active-context` cookie (`httpOnly`, so client JS cannot read or
   forge it directly either) and logs an `context.switched` audit event.

This means a tampered cookie, a forged `organisationId` in a request body, or
any other client-supplied context can never grant access beyond what the
database says the user is actually a member of — every `/api/platform/*`
route re-derives the access profile from the bearer token on every request;
none of them trust a client-supplied id without checking it against that
profile first (`src/lib/platform/permissions.ts`).

Switching context changes: the data shown (Manage it, Users, Audit it all key
off `activeContext`), the available Create it actions, and the branding shown
in the header and logo (merchant → organisation → platform inheritance, §7).
The active context (name + role) is always visible in the header.

## 7. Branding architecture ("Brand it")

Three scope levels, one singleton row per scope:

```
branding_profiles(scope, scope_id)
  'platform'      scope_id = NULL   (exactly one row, seeded on migration)
  'organisation'  scope_id = organisations.id
  'merchant'      scope_id = merchants.id
```

`branding_assets` holds **metadata only** (`storage_bucket`, `storage_path`,
`mime_type`, `file_size_bytes`, optional `width`/`height`) — binaries live in
the `branding-assets` Supabase Storage bucket
(`{scope}/{scope_id-or-"global"}/{asset_type}.{ext}`), never in Postgres.

**Inheritance** (`src/lib/platform/branding.ts: resolveBranding()`) resolves
merchant → organisation → platform *per field and per asset type
independently* — a merchant can override just its accent colour and still
inherit the platform's primary logo, or override its logo and inherit
everything else. `powered_by_visible` is the one field always taken from the
platform layer only, per the brief's "Nexus it logo remains visible unless a
future white-label plan explicitly permits removal."

**Permissions** (`can_manage_branding()` in SQL, mirrored as
`canManageBrandingForScope()` in TypeScript):
- Platform scope: `nexus_super_admin` only.
- Organisation scope: `organisation_owner`/`organisation_admin` (or platform
  admin).
- Merchant scope: `merchant_owner`/`merchant_admin` (or an organisation
  admin/owner of the parent org, or platform admin) — **and only if** the
  parent organisation's `branding_profiles.allow_merchant_branding` is true.

**Reads are public** (`branding_profiles`/`branding_assets` RLS: `SELECT USING (TRUE)`,
storage bucket `public = TRUE`) — branding must render on hosted booking
forms, tracking pages, and embeds without a signed-in session, and carries no
sensitive data. Writes are gated by the checks above at both the RLS and API
layer.

**Upload validation**: PNG/JPG/JPEG/WebP/SVG only, 5MB limit, and any
uploaded SVG is scanned for `<script>`/`on*=`/`javascript:` before being
accepted (`src/app/api/platform/branding/assets/route.ts`). Pixel-dimension
validation (beyond file-type/size) is **not** implemented this sprint — see
§18.

**"Restore inherited branding"** is simply deleting the override asset row
(and its storage object) at that scope — `resolveBranding()` then falls
through to the parent scope automatically, with no separate "restore" logic
needed.

Every create/update/delete on a branding profile or asset writes an
`audit_events` row (`branding.updated`, `branding.asset_uploaded`,
`branding.asset_removed`).

Branding is not yet wired into hosted booking forms, tracking pages, emails,
invoices, or embeds — those surfaces don't exist yet (out of scope this
sprint). `GET /api/platform/branding` is the one, reusable, public endpoint
those future surfaces will call.

## 8. Database model

New tables this sprint (all in `supabase/migrations/2026072709*`):

| Table | Purpose |
|---|---|
| `merchants` | Canonical merchant entity, child of `organisations`. |
| `organisation_memberships` | User ↔ organisation, with role + status. |
| `merchant_memberships` | User ↔ merchant, with role + status. |
| `branding_profiles` | Per-scope branding settings (colours, contact details, toggles). |
| `branding_assets` | Per-scope logo/image metadata; binaries in Storage. |
| `audit_events` | Immutable audit trail for the new foundation. |

No new tables were added beyond what the brief asked for. `platform_admin_bootstrap`,
`roles`, `permissions`, `role_permissions`, `user_roles` (all pre-existing)
are reused for platform-level roles rather than duplicated — see §17.

Every new table follows the same conventions as the existing schema:
`gen_random_uuid()` primary keys, `created_at`/`updated_at` with the existing
`set_updated_at_timestamp()` trigger, `IF NOT EXISTS`/`ON CONFLICT`
idempotency throughout so migrations are safe to re-run.

## 9. RLS strategy

Every new table has RLS **enabled and forced** (`FORCE ROW LEVEL SECURITY`,
matching the stricter posture the previous `organisation_foundation` migration
introduced, applied consistently this time):

| Table | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `merchants` | member of merchant or its organisation | organisation manage role | none (archive via status) |
| `organisation_memberships` | self, or organisation member | organisation manage role | organisation manage role |
| `merchant_memberships` | self, or merchant/organisation member | merchant or organisation manage role | merchant or organisation manage role |
| `branding_profiles` / `branding_assets` | public (`TRUE`) | scope-appropriate manage role | scope-appropriate manage role |
| `audit_events` | organisation/merchant member, or platform admin | **none** (write only via `log_audit_event()` or service-role) | **none** (immutable) |

The existing `can_access_organisation()`/`can_manage_organisation()`
functions (originally written against `profiles`/`organisation_users`) were
extended, via `CREATE OR REPLACE`, to *also* check
`organisation_memberships` — every pre-existing policy that already used
those two functions (on `organisations` and `organisation_users`) picked up
the new membership model automatically, with zero policy changes required.

This sprint deliberately does **not** touch RLS on any pre-existing
operational table (`draft_jobs`, `merchant_catalogue_items`,
`sales_channels`, `merchant_integration_connections`, etc.) flagged as
missing RLS in the prior technical audit — fixing those is real, necessary
work, but it is operational-module work, out of scope for "only build the
foundation those modules will rely on." It is called out again in §18 so it
is not forgotten.

## 10. Migration strategy

The repository already had two eras of tenancy code living side by side
before this sprint:

1. **Legacy** (`company_id`, `profiles.role`, `organisation_users`,
   `customer_portal_users`) — still the only thing every existing operational
   route (`/api/merchant/*`, `/api/process-it/*`, `/api/document-it/*`, the
   entire `/portal` and legacy `-it` navigation) understands.
2. **Foundation it** (`organisations`, `merchants`,
   `organisation_memberships`, `merchant_memberships`) — new this sprint,
   powering `/app/*` and `/api/platform/*` only.

**This sprint does not force a cutover.** No legacy table or column was
dropped, renamed, or had its meaning changed. `assign_default_role_to_auth_user()`
was widened (via `CREATE OR REPLACE`, same trigger) to *additionally* grant
`nexus_super_admin` alongside the existing `super_admin` role — additive, not
destructive. Every new migration uses `IF NOT EXISTS`/`ON CONFLICT DO
NOTHING`/`DO UPDATE`, so re-running them is safe and no existing row is ever
overwritten with data it didn't already have.

**Why not migrate operational tables now**: `draft_jobs` alone has ~90
columns and zero RLS (a known, separate risk — see the prior audit and §18);
`merchant_catalogue_items`, `sales_channels`, and others have no RLS either.
Retrofitting `merchant_id`/`organisation_id`-based access onto them, safely,
requires understanding each operational workflow in depth — that is squarely
"Catalogue it"/"Book it"/"Process it" work the brief explicitly excludes from
this sprint. Attempting it here would both violate that scope boundary and
risk breaking a live operational surface this sprint has no test coverage
for.

**The path for a future sprint** (recorded here so it isn't lost):
1. Add `merchant_id` (nullable at first) to the operational tables that need
   it, backfilled from whatever legacy relationship currently stands in for
   it.
2. Enable RLS on those tables using the same `can_access_merchant()`/
   `can_access_organisation()` functions this sprint already built.
3. Once application code is verified against the new columns and policies in
   a staging environment, make the new columns `NOT NULL` and retire the
   `company_id`-only code paths.
4. Only then consider dropping `organisation_users`, `customer_portal_users`,
   and `profiles.role` as authorization inputs (see §17).

No step here is destructive until step 4, and step 4 is explicitly deferred.

## 11. Application route map

New routes this sprint:

```
/login                                  new canonical sign-in
/app                                    redirects to /app/manage-it
/app/manage-it                          foundation dashboard (context-aware)
/app/create-it                          quick-links hub to every create/invite workflow
/app/brand-it                           branding editor (?scope=&scopeId=)
/app/organisations                      list + create organisation
/app/organisations/[id]                 detail: edit/archive, merchants, members, branding link
/app/merchants                          list (from the caller's own access profile)
/app/merchants/[id]                     detail: edit/archive, members, branding link
/app/users                              members of the active context (org or merchant)
/app/audit-it                           audit event viewer for the active context
/app/settings                           context summary + links to Brand it

/api/platform/access-profile            GET
/api/platform/context                   GET/POST/DELETE
/api/platform/organisations              GET/POST
/api/platform/organisations/[id]         GET/PATCH
/api/platform/organisations/[id]/merchants     GET/POST
/api/platform/organisations/[id]/memberships   GET/POST
/api/platform/organisation-memberships/[id]    PATCH/DELETE
/api/platform/merchants/[id]             GET/PATCH
/api/platform/merchants/[id]/memberships GET/POST
/api/platform/merchant-memberships/[id]  PATCH/DELETE
/api/platform/branding                   GET (public, resolved/inherited)
/api/platform/branding/profile           GET/PATCH (own-layer, permission-checked)
/api/platform/branding/assets            POST/DELETE
/api/platform/audit-events                GET
```

**Nothing existing was deleted or rewritten.** `/signin`, `/signup`,
`/auth/*`, `/manage-it`, `/portal/*`, and the flat "-it" navigation continue
to work exactly as before — this sprint added a second, self-contained
surface rather than editing the first. Why: those routes back real,
currently-used operational workflows this sprint has no mandate or test
coverage to touch. §17 records these as candidates to consolidate/retire once
the operational modules migrate onto this foundation, per the brief's "remove
or archive conflicting duplicate routes rather than supporting two separate
information architectures" — that consolidation is future work, not
something safe to do blind in this sprint.

## 12. Navigation model

One canonical nav for the new shell (`src/components/platform/AppShellChrome.tsx`):
Manage it, Create it, Brand it, Organisations, Merchants, Users, Audit it,
Settings — exactly the set the brief specifies — plus a visibly-disabled
"Coming later" section (Book it, Catalogue it, Track it, Invoice it) so the
product's future shape is visible without those modules being clickable or
functional yet.

This nav is intentionally **not** merged into the legacy `AppShell`/`Sidebar`
components (which carry the purple "verb-it" visual language and a much
larger, partially-placeholder nav tree) — merging them now would mean either
breaking the legacy nav's existing behaviour or compromising the new shell's
"calm, professional, no dominant purple" requirement. `/app/*` is the one
place, going forward, new modules should be added; the legacy nav is a
migration source, not a second home for new work.

## 13. Audit model

`audit_events` (§8/§9) is immutable and append-only: no `UPDATE`/`DELETE`
policy exists for any role except `service_role`, and even service-role
writes only ever happen through `INSERT`. Every foundation mutation records
one:

- `organisation.created` / `organisation.updated` / `organisation.archived`
- `merchant.created` / `merchant.updated` / `merchant.archived`
- `membership.created` / `membership.role_changed` / `membership.removed`
  (both organisation- and merchant-scoped)
- `branding.updated` / `branding.asset_uploaded` / `branding.asset_removed`
- `context.switched`

Each row carries `actor_user_id`, `organisation_id`/`merchant_id` (whichever
applies), `action`, `entity_type`, `entity_id`, a `metadata` JSON blob with
before/after values where relevant, `source` (`"app"`), and `created_at`.
`GET /api/platform/audit-events` resolves `actor_user_id` → email via a
single batched `auth.admin.listUsers()` call rather than one lookup per row.

This is a separate table from the pre-existing `audit_log`
(`manage_it_permissions.sql`), which remains the legacy Manage It admin-action
log and is untouched.

## 14. Storage model

One new bucket, `branding-assets` (public, mirroring the existing
`company-logos` bucket's public-read pattern): path convention
`{scope}/{scope_id-or-"global"}/{asset_type}.{extension}`. Storage RLS
policies re-check the same `can_manage_organisation()`/`can_manage_branding()`
functions used everywhere else, keyed off the first two path segments — so a
forged upload path targeting another tenant's folder is rejected server-side
regardless of what the client claims. No existing bucket
(`merchant-documents`, `company-logos`) was modified.

## 15. Security model

- **Bearer-token verification on every request.** Every `/api/platform/*`
  route calls `getAuthenticatedUser()` (verifies the token against Supabase
  Auth) before doing anything else — no route trusts a client-supplied user
  id.
- **Service-role client, application-level permission checks.** Like the
  existing codebase's pattern (`getMerchantContext`), writes use the
  privileged (service-role) client, which bypasses RLS — so
  `src/lib/platform/permissions.ts` re-implements the same access checks in
  application code as a mandatory gate before any write, not an optional
  nicety.
- **RLS as a second, independent layer** for anything queried with a
  user-scoped client (and as defence-in-depth generally).
- **Context is always re-verified server-side** (§6) — never trusted from a
  cookie or request body alone.
- **No secret values are logged.** `.env.example` lists variable *names*
  only; server code never logs `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
  values, only high-level error messages.
- **Uploaded SVGs are scanned** for script content before acceptance (§7).
- **No public write access** to any new tenant table — every `INSERT`/`UPDATE`/`DELETE`
  policy requires a specific role check; only `branding_profiles`/`branding_assets`
  SELECT is public, by design (§7).

## 16. Deployment and environment strategy

No new environment variables were introduced. Foundation it reuses:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the
legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` alias), `SUPABASE_SECRET_KEY` (or the
legacy `SUPABASE_SERVICE_ROLE_KEY` alias). See `.env.example` (names only, no
values) and the updated `README.md`.

Migrations are plain Supabase CLI migrations (`supabase/migrations/2026072709*`) —
apply with `npx supabase db push` exactly as documented in `README.md`, in
filename order, same as every existing migration. No infrastructure, Vercel
config, or CI changes were required.

## 17. Keep / rebuild / remove / archive assessment

| Item | Verdict | Why |
|---|---|---|
| `organisations` table | **KEEP** | Already the right shape; reused unchanged. |
| `roles`/`permissions`/`role_permissions`/`user_roles`/`has_permission()` | **KEEP, extended** | Correct existing infrastructure for platform-level roles; extended with `nexus_super_admin`/`nexus_support` rather than duplicated. |
| `merchants`, `organisation_memberships`, `merchant_memberships`, `branding_profiles`, `branding_assets`, `audit_events` | **NEW (this sprint)** | Exactly the tables the brief required. |
| Legacy `AppShell`/`Sidebar`/`Header`/`AuthGate` | **KEEP (untouched, except one allowlist line in AuthGate)** | Still serve every existing operational route; out of scope to rebuild this sprint. |
| `organisation_users` | **ARCHIVE (candidate)** | Superseded by `organisation_memberships` for anything new; kept only because the `profiles` trigger (`sync_profile_organisation_membership`) still writes to it and nothing this sprint reads it. Safe to drop once that trigger and any remaining reader are retired. |
| `customer_portal_users` | **ARCHIVE (candidate)** | A parallel identity table for a merchant's own customers; out of scope to fold into `organisation_memberships`/`merchant_memberships` (those are for organisation/merchant *staff*, not end customers) — worth a deliberate decision in a future sprint, not a silent merge here. |
| `profiles.role` as an authorization input | **REBUILD (future)** | Kept as a read-only legacy field for existing operational code; new code never treats it as authoritative. Fully retiring it requires migrating every remaining reader (`serverAuth.ts`, `customerAuth.ts`, the legacy `AppShell`) onto membership-based checks — real work, sequenced after operational tables gain `merchant_id`/RLS (§10). |
| `draft_jobs` and other operational tables with no RLS | **REBUILD (urgent, separate sprint)** | Confirmed still true after this sprint — unchanged, since fixing it is operational-module work explicitly out of scope here. Flagged again so it is not lost. |
| Legacy `-it` flat nav vs `/portal/*` vs new `/app/*` | **REBUILD (consolidate, future sprint)** | Now *three* navigation surfaces exist. This sprint added the third deliberately isolated rather than editing the other two blind; a future sprint should retire the flat "-it" nav and fold `/portal/*` functionality into `/app/*` once each module has a Foundation-it-native replacement. |
| `/signin` + `/signup` vs new `/login` | **ARCHIVE (candidate)** | `/login` is now canonical for the new shell; the old pair still backs every legacy `AuthGate`-protected route and was left alone. |

## 18. Risks

- **`npm run lint` does not pass for the whole repository.** All new
  Foundation it code (everything under `src/lib/platform/`,
  `src/app/api/platform/`, `src/components/platform/`, `src/app/app/`,
  `src/app/login/`) is lint-clean (0 errors, 0 warnings). The pre-existing 33
  errors / 20 warnings in legacy files (`Sidebar.tsx`, `StandardOrderForm.tsx`,
  `WorkspaceSelector.tsx`, and others) are unchanged from before this sprint
  started and were left alone per "do not modify unrelated operational
  modules unless required to keep the build working." **This is a real,
  outstanding gap against the sprint's stated acceptance criteria**, recorded
  honestly rather than worked around.
- **Migrations were not run against a live database.** This sandbox has no
  network access to a real Supabase/Postgres instance, so the five new
  migration files were written and carefully reviewed but not executed end to
  end. They follow the exact conventions (idempotency, trigger/function
  naming, RLS patterns) of the 29 existing migrations they build on, but
  should be applied to a staging Supabase project and verified before
  production use.
- **Branding asset dimension validation is not implemented.** File type and
  5MB size are enforced; pixel dimensions are not measured server-side (no
  image-processing dependency was added, to avoid an unjustified new
  dependency for a foundation sprint). Guidance text is shown to the uploader
  instead. A future sprint could add real dimension checks.
- **`/app/*` page-level auth is client-side**, matching the existing
  `AuthGate` convention used everywhere else in this repository (not a
  Sprint-1-specific weakness, but not improved either) — every `/api/platform/*`
  route still independently re-verifies the bearer token server-side
  regardless, so this does not weaken data access, only the speed of the
  redirect for a signed-out user hitting `/app` directly.
- **Invite flow assumes email delivery is configured** in the Supabase
  project (SMTP settings) — `inviteUserByEmail` will create the user
  regardless, but they won't receive a usable link without it.
- **`organisation_users` and `customer_portal_users` still exist and are
  still written to** by pre-existing triggers/code. They are not part of the
  new authorization path, but leaving them in place means there are, for now,
  three membership-shaped tables in the schema. This is intentional (§10,
  §17), not an oversight, but is worth tracking so it doesn't become
  permanent.

## 19. Decisions made

- **Platform-level roles reuse the existing `roles`/`user_roles` system**
  rather than a new `platform_memberships` table, because that system already
  exists, already has `has_permission()`, and a platform admin is not scoped
  to any organisation/merchant the way the brief's other two role tiers are —
  a dedicated table would duplicate, not replace, working infrastructure.
- **`organisation_users` and `customer_portal_users` are not touched or
  removed this sprint.** Both still have live readers/writers in the existing
  codebase; removing either without first migrating those readers would risk
  breaking currently-working operational flows this sprint has no test
  coverage for. They are documented as archive candidates, not silently kept
  forever.
- **`can_access_organisation()`/`can_manage_organisation()` were extended in
  place** (same function name, `CREATE OR REPLACE`) rather than introducing
  new, differently-named functions, so every existing RLS policy that already
  called them gained membership-based access control for free.
- **`powered_by_visible` is only honoured from the platform branding layer**,
  even though the column exists on every scope, per the brief's explicit
  instruction that the Nexus it mark stays visible absent a future
  white-label plan.
- **No new environment variables, no new third-party dependencies.** Image
  dimension checking, for example, was left unimplemented rather than adding
  a new npm dependency for it in a foundation sprint.
- **A new, visually-separate application shell (`/app/*`) was built instead
  of editing `AppShell`/`Sidebar`/`Header`** in place, so the "no dominant
  purple, calm/professional" visual direction could be delivered cleanly on
  day one without destabilising the legacy operational screens that still
  use the old visual language.

## 20. Future module compatibility

Everything Book it, Catalogue it, Track it, Invoice it, and a WordPress
connector will need already exists at the foundation level:

- **Tenancy**: create a merchant under an organisation, done.
- **Identity/roles**: invite a user with a specific role to that merchant,
  done.
- **Context**: a user managing multiple merchants can switch between them,
  done, server-verified.
- **Branding**: every hosted surface those modules will need (booking forms,
  tracking pages, emails, invoices, embeds) can call the same
  `GET /api/platform/branding` this sprint built, with inheritance already
  solved.
- **Audit**: every future module can call the same `audit_events` table via
  the same `recordAuditEvent()` helper.
- **Integrations**: the pre-existing `integration_providers`/
  `merchant_integration_connections` tables (from before this sprint) already
  model "Nexus it owns the experience, external systems are replaceable
  connectors" — a future WordPress connector is an *additional* row in
  `integration_providers` plus an embed/shortcode surface, not a new tenancy
  or identity model.
- **What's still missing for those modules**: `merchant_id`/RLS on the
  relevant operational tables (§10, §17) — that migration should happen
  incrementally, one module at a time, as each is actually built, rather than
  speculatively in this sprint.
