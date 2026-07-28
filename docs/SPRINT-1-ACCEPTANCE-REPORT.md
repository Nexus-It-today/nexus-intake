# Nexus It — Sprint 1 "Foundation it" — Acceptance Report

This report replaces the earlier, code-only Sprint 1 summary. Every item below
was tested **live**: a real local Supabase stack (Postgres + Auth + Storage,
via `npx supabase start`, Docker) with all 34 migrations applied, a running
`npm run dev` server, five real test user accounts, and either an HTTP
request/response or a direct SQL query as evidence. Nothing here is "the code
exists" — every PASS has an actual request, an actual response, or an actual
query result attached.

No browser was available in this environment (no Chromium/Chrome installed,
headless or otherwise), so there are no screenshots. Every UI page listed was
still verified to render (HTTP 200, no server error) via `curl`, and every
action a user would take on that page was verified through the exact API
endpoint that page calls — the same code path a browser would exercise. This
is disclosed explicitly, not glossed over; see "Verification method" below
each section and the Remaining Technical Debt section.

## What changed since the last (unverified) summary

Live testing found **two real, previously-unverified bugs**. Both are fixed
and re-verified below.

1. **`/manage-it` route protection was completely non-functional** — not
   because of anything in Sprint 1, but because this Next.js version
   (16.2.9) renamed the `middleware.ts` file convention to `proxy.ts`, and
   additionally requires it to live at the same directory level as `app`
   (i.e. `src/proxy.ts` in this project, not the project root). The
   pre-existing `middleware.ts` at the project root was silently never being
   picked up at all. **Fixed**: moved to `src/proxy.ts`, function renamed
   `middleware` → `proxy` (same logic, same matcher). Verified live: `GET
   /manage-it` with no session cookie now returns `307` → `/signin`.
2. **Merchant-level branding silently skipped the organisation inheritance
   layer** when only a `merchantId` was supplied (the exact case the header,
   hosted booking forms, and embeds will use in practice). Root cause: the
   route resolved the merchant's parent `organisation_id` using the
   anon-key client, but `merchants` RLS blocks anonymous reads, so the lookup
   silently returned nothing and the chain fell straight from merchant to
   platform, skipping the organisation's own branding. **Fixed**: that one
   internal lookup (merchant → its `organisation_id`, never merchant data
   itself) now uses the service-role client. Verified live: a merchant with
   its own colour override now correctly shows its own colour, its parent
   organisation's display name, and the platform's accent colour, all three
   layers at once.

Both fixes are small, mechanical, and scoped to exactly the broken behaviour —
no other logic was touched.

## Verification setup

- `npx supabase start` — local Postgres/Auth/Storage/Studio via Docker.
- `npx supabase db reset` — applies all 34 migrations (29 pre-existing + 5 from
  this sprint) from scratch. Run twice during this review; both times: **zero
  errors**.
- `npm run dev`, pointed at the local stack via a temporary
  `.env.development.local` (Next.js env-file precedence puts this ahead of
  `.env.local`, so the real Supabase project credentials in `.env.local` were
  never read, modified, or exposed during this review).
- 5 real test accounts created via the Supabase Admin API, clearly fictional:
  `office@nexus.delivery` (matches the platform bootstrap-admin allowlist),
  `org-a-admin@example-test.dev`, `org-a-viewer@example-test.dev`,
  `org-b-admin@example-test.dev`, `merchant-a1-admin@example-test.dev`.
- A 37-assertion automated test script (`tmp/acceptance_test_suite.mjs`)
  signs in as each user via the real Supabase Auth REST API, then calls the
  real `/api/platform/*` endpoints with the resulting JWTs — exactly what the
  browser UI does. **Final result: 37/37 passed.**
- Several assertions were additionally cross-checked directly against
  Postgres with `psql`, impersonating `anon`/`authenticated` roles via `SET
  ROLE`, independent of the application layer.

---

## 1. Organisation creation, editing, management

**Page/route**: `/app/organisations` (list + create), `/app/organisations/[id]` (edit/archive) — backed by `POST/GET /api/platform/organisations`, `PATCH /api/platform/organisations/[id]`.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Sign in as `office@nexus.delivery` (nexus_super_admin). `POST /api/platform/organisations` with `{name, tradingName, ownerEmail}` | 201, organisation created, owner invited as `organisation_owner` | `201 orgId=cbb54563-... ownerInviteError=null` | **PASS** |
| 2 | Sign in as `org-a-admin` (organisation_owner, not a platform admin). `POST /api/platform/organisations` | 403 — only platform admins onboard new tenants | `403 {"error":"Only Nexus platform admins can create organisations."}` | **PASS** |
| 3 | As `org-a-admin`, `PATCH /api/platform/organisations/:id { tradingName }` | 200, trading name updated | `200 tradingName="Test Org A (renamed)"` | **PASS** |
| 4 | As `org-a-admin`, `PATCH .../:id { status: "archived" }`, then `{ status: "active" }` | Status flips both ways, no `DELETE` ever used | `archived-status=archived restored-status=active` | **PASS** |

**Steps to reproduce manually in the UI**: sign in at `/login` as a
`nexus_super_admin`, go to `/app/organisations`, click **Create organisation**,
fill the form (optionally an owner email), submit. Open the created
organisation, use **Edit** to rename it, use **Archive**/**Restore** to
toggle status.

## 2. Merchant creation, editing, management

**Page/route**: `/app/organisations/[id]` (create merchant), `/app/merchants/[id]` (edit/archive) — backed by `POST /api/platform/organisations/[id]/merchants`, `PATCH /api/platform/merchants/[id]`.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | As `org-a-admin`, `POST /api/platform/organisations/:orgAId/merchants { name }` | 201, merchant created under Organisation A | `201 merchantId=75d54060-...` | **PASS** |
| 2 | As `org-b-admin` (no relationship to Org A), same call against Org A's id | 403 | `403` | **PASS** |
| 3 | As `org-a-admin`, `PATCH /api/platform/merchants/:id { tradingName }` — note: `org-a-admin` has no explicit merchant membership row, only the parent org role | 200 — organisation admins/owners inherit merchant-manage rights | `200` | **PASS** |
| 4 | Archive then restore the merchant via status field | Status flips both ways | `archived=archived restored=active` | **PASS** |

**Steps to reproduce manually**: open an organisation at `/app/organisations/[id]`, click **Create merchant**, submit. Open `/app/merchants/[id]`, use **Edit**/**Archive**.

## 3. Memberships and role-based permissions

**Page/route**: `/app/users` (context-scoped member list), `/app/organisations/[id]` and `/app/merchants/[id]` (embedded member manager) — backed by `POST/PATCH/DELETE` on `/api/platform/organisations/[id]/memberships`, `/api/platform/organisation-memberships/[id]`, and the merchant equivalents.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | As `org-a-admin`, invite `org-a-viewer@example-test.dev` as `organisation_viewer` | 201, membership `status: "active"` (pre-existing user) | `201 status_field=active` | **PASS** |
| 2 | As `org-a-viewer`, try to create a merchant under Org A | 403 — viewer role is read-only | `403` | **PASS** |
| 3 | As `org-a-viewer`, `GET` the organisation | 200 — viewer role can still read | `200` | **PASS** |
| 4 | As `org-a-admin`, `PATCH` org-a-viewer's membership `{ role: "organisation_operator" }` | 200, role changed | `200 newRole=organisation_operator` | **PASS** |
| 5 | As `org-a-admin`, invite `merchant-a1-admin@example-test.dev` as `merchant_owner` on Merchant A1 | 201 | `201` | **PASS** |
| 6 | As `merchant-a1-admin`, edit Merchant A1 | 200 — merchant_owner can manage their own merchant | `200` | **PASS** |
| 7 | As `merchant-a1-admin`, try to edit the parent organisation | 403 — merchant role does not grant organisation access | `403` | **PASS** |
| 8 | As `org-a-admin`, `DELETE` org-a-viewer's membership, then immediately re-check org-a-viewer's access | Membership removed; org-a-viewer instantly loses access | `deleteStatus=200 postRemovalAccessStatus=403` | **PASS** |

**Steps to reproduce manually**: on `/app/organisations/[id]` or `/app/merchants/[id]`, use the **Members** panel's "Invite by email" form, the per-row role dropdown, and the **Remove** button.

## 4. Working As context switching

**Page/route**: header "Working as" switcher (`src/components/platform/WorkingAsSwitcher.tsx`) on every `/app/*` page — backed by `GET/POST /api/platform/context`.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | As `org-a-admin`, `POST /api/platform/context { type: "organisation", id: orgAId }` (a real membership) | Switches successfully | `activeContext={"type":"organisation","id":"cbb54563-...","role":"organisation_owner"}` | **PASS** |
| 2 | As `org-a-admin`, `POST /api/platform/context { type: "organisation", id: orgBId }` (**not** a member of Org B) | Request is NOT rejected with an error, but the forged id is silently ignored and the server falls back to a context the user actually belongs to | Requested Org B, server returned active context still `= Org A` | **PASS** |
| 3 | As `office@nexus.delivery` (platform admin, no explicit membership anywhere), switch into Org B | Succeeds — platform admins can enter any tenant | `activeContext.id = orgBId` | **PASS** |

This is the single most important security property in the sprint: **#2
proves a forged/stale client-supplied organisation id can never grant
access it isn't entitled to** — the server always re-derives the allowed
list from real membership rows before honouring any requested switch.

**Steps to reproduce manually**: sign in as a user with 2+ memberships, click "Working as" in the header, pick a different organisation/merchant from the dropdown, observe the page data change.

## 5. Data isolation between organisations

**Page/route**: any `/app/organisations/[id]`, `/app/merchants/[id]`, `/app/audit-it` — backed by RLS + the application-level permission checks in every `/api/platform/*` route.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | As `org-a-admin`, `GET /api/platform/organisations/:orgBId` | 403 | `403` | **PASS** |
| 2 | As `org-b-admin`, `GET /api/platform/organisations/:orgAId` | 403 | `403` | **PASS** |
| 3 | As `org-b-admin`, `GET /api/platform/merchants/:merchantA1Id` (belongs to Org A) | 403 | `403` | **PASS** |
| 4 | As `org-b-admin`, `GET /api/platform/audit-events?organisationId=:orgAId` | 403 | `403` | **PASS** |
| 5 (DB-level, independent of the app) | `SET ROLE anon; SELECT count(*) FROM public.organisations;` | 0 rows visible — RLS blocks anonymous reads entirely | `anon_visible_organisations = 0` (service_role sees all 4 for comparison) | **PASS** |

**Steps to reproduce manually**: sign in as two different organisation admins in two browser sessions; confirm neither can navigate to (or is even shown) the other's organisation/merchant/audit data.

## 6. Branding inheritance

**Page/route**: `/app/brand-it?scope=&scopeId=` — backed by `GET /api/platform/branding` (public, resolved), `GET/PATCH /api/platform/branding/profile`, `POST/DELETE /api/platform/branding/assets`.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `GET /api/platform/branding` (no auth, no scope) | Returns the Nexus it platform default | `displayName="Nexus it", primaryColour=#0F172A, accentColour=#2563EB` | **PASS** |
| 2 | As platform admin, `PATCH .../profile?scope=platform { accentColour: "#FF00AA" }` | Platform accent colour updates | `accentColour=#FF00AA` | **PASS** |
| 3 | As `org-a-admin`, set **only** `displayName` at organisation scope (leave colours unset) | Only that one field is stored at org level | profile has `display_name` set, colours still `null` | **PASS** |
| 4 | `GET /api/platform/branding?organisationId=orgA` | Resolves org's own `displayName` **and** the platform's `accentColour` (not set at org level) — proves per-field inheritance, not per-record | `displayName="Test Org A Brand" (organisation), accentColour="#FF00AA" (platform)` | **PASS** |
| 5 | As `org-a-admin`, set `allowMerchantBranding = false` on Org A | Merchant branding writes now blocked for that org's merchants | `200` | **PASS** |
| 6 | As `merchant-a1-admin`, try to edit Merchant A1's branding while disabled | 403 | `403` | **PASS** |
| 7 | Re-enable, then `merchant-a1-admin` sets merchant's own `primaryColour` | 200 | `200` | **PASS** |
| 8 | `GET /api/platform/branding?merchantId=merchantA1Id` | Resolves merchant's **own** colour + org's `displayName` + platform's `accentColour` — three independent layers at once | `{primaryColour: merchant, displayName: organisation, accentColour: platform}` | **PASS** (found broken, fixed, re-verified — see "What changed" above) |

**Steps to reproduce manually**: `/app/brand-it` as platform admin — set a colour. Open `/app/brand-it?scope=organisation&scopeId=<orgId>` as that org's admin — set only the display name. Open `/app/brand-it?scope=merchant&scopeId=<merchantId>` as a merchant admin — the platform colour and org name should already show as "inherited" before you override anything.

## 7. Audit event creation

**Page/route**: `/app/audit-it` — backed by `GET /api/platform/audit-events`.

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | After performing every action in sections 1–6 above, `GET /api/platform/audit-events?organisationId=orgA` | Every action type appears: `organisation.created/updated`, `merchant.created/updated`, `membership.created/role_changed/removed`, `branding.updated`, `context.switched` | 19 events recorded, **zero missing action types** | **PASS** |
| 2 | Inspect any event row | Actor is shown as a real email, not a raw UUID | `"actorEmail":"org-a-admin@example-test.dev"` | **PASS** |
| 3 | As `org-b-admin`, try to read Org A's audit trail | 403 | `403` | **PASS** |
| 4 (DB-level) | `SET ROLE authenticated; UPDATE public.audit_events SET action='tampered' WHERE action='organisation.created';` | 0 rows affected — no UPDATE policy exists for `authenticated` at all | `UPDATE 0` | **PASS** |

**Steps to reproduce manually**: perform any create/edit/invite/branding action, then open `/app/audit-it` in the same organisation context and confirm the new row appears immediately with your email as the actor.

## 8. Route protection

**Page/route**: every `/api/platform/*` endpoint (unauthenticated), plus the legacy `/manage-it` (cookie/proxy-gated).

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `GET /api/platform/access-profile` with no `Authorization` header | 401 | `401 {"error":"Session expired. Please sign in again."}` | **PASS** |
| 2 | `POST /api/platform/organisations` with no `Authorization` header | 401 | `401` | **PASS** |
| 3 | `GET /manage-it` with no session cookie | 307 → `/signin` | Initially **200 (no redirect at all)** — found broken, fixed (see "What changed"), re-verified: `307 → /signin` | **PASS (after fix)** |

**Steps to reproduce manually**: open a private/incognito window, navigate directly to `/manage-it` — you should land on `/signin`. Try calling any `/api/platform/*` endpoint from a REST client with no token — you get 401.

## 9. RLS enforcement

Covered concretely across sections 5, 6, and 7 above (isolation-1..4,
branding-6, audit DB-level test). Additional direct DB-level checks:

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `SET ROLE anon; SELECT count(*) FROM public.organisations;` | 0 — no public read of tenant data | `0` | **PASS** |
| 2 | `SET ROLE authenticated; UPDATE audit_events ...` | 0 rows — immutable | `UPDATE 0` | **PASS** |
| 3 | `SELECT count(*) FROM public.organisations;` as `postgres`/service-role, for comparison | Sees all rows (2 seed + 2 test = 4) | `4` | **PASS** |

## 10. All Supabase migrations successfully applied

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `npx supabase db reset` (run twice, from scratch) | All 34 migrations (29 pre-existing + 5 new) apply with no errors | Both runs: every migration listed as `Applying migration ...` with zero errors, ending "Finished supabase db reset" | **PASS** |
| 2 | Confirm the 6 new foundation tables exist | `merchants`, `organisation_memberships`, `merchant_memberships`, `branding_profiles`, `branding_assets`, `audit_events` | All 6 present via `information_schema.tables` query | **PASS** |
| 3 | Confirm new roles seeded | `nexus_super_admin`, `nexus_support` present in `public.roles` | Both present (12 total role slugs) | **PASS** |
| 4 | Confirm the platform branding singleton seeded correctly | One `platform` row, Nexus it defaults | `display_name=Nexus it, primary_colour=#0F172A, accent_colour=#2563EB` | **PASS** |
| 5 | Confirm the bootstrap-admin trigger grants both legacy and new platform roles | `office@nexus.delivery` gets `super_admin` **and** `nexus_super_admin` on signup | Both roles present for that user | **PASS** |

## 11. Existing functionality still working without regression

| # | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Insert a row into legacy `public.companies` | Pre-existing `sync_company_to_organisation` trigger auto-creates a matching `organisations` row (untouched by this sprint) | New organisation row appeared with matching name | **PASS** |
| 2 | `GET /` , `/signin`, `/booking-forms/embedded` (legacy pages) | Render 200, no server error | All `200` | **PASS** |
| 3 | `npm run typecheck` | 0 errors | 0 errors | **PASS** |
| 4 | `npm run lint` (whole repo) | New Sprint 1 files: 0 errors/warnings. Whole repo: same 33 errors/20 warnings as before this sprint (pre-existing, untouched legacy files) | Confirmed identical baseline; two touched files (`src/proxy.ts`, `branding/route.ts`) individually lint-clean | **PASS** (with the same pre-existing-debt caveat as before) |
| 5 | `npm run build` | Full production build succeeds | See "Build status" below | **See below** |

### Build status — RESOLVED

`npm run build` succeeded cleanly: `✓ Compiled successfully in 27.5s`, all
157 routes generated, exit code 0. (One earlier build attempt in this review
was killed by the sandbox's own memory pressure — a local Supabase Docker
stack plus Turbopack together exceeded this environment's ~7.8GB — not a
code failure; stopping the Docker containers after DB testing was complete
resolved it.)

The production build's `middleware-manifest.json` does appear empty
(`"middleware": {}, "functions": {}`), which initially looked like a red
flag. To resolve it definitively, the actual production server was started
(`npm run start`, i.e. `next start` against the real build output, not `next
dev`) and tested directly:

```
GET /manage-it (no session cookie)  -> HTTP/1.1 307, location: /signin   ✅
GET /api/platform/access-profile (no token) -> 401                       ✅
GET /, /login, /app/manage-it, /signin -> all 200                        ✅
```

**Route protection works correctly under real production serving.** The
empty manifest file is a red herring in this Next.js version/Turbopack
combination, not a sign of broken behaviour — confirmed by testing actual
runtime behaviour rather than trusting the artifact. No further action
needed here; recommend one confirmation on an actual Vercel deploy before
this is fully closed out operationally, since a sandboxed `next start` is
still not identical to Vercel's edge/serverless split.

---

## Completed features (verified live)

- Organisation create / edit / archive+restore, with platform-admin-only creation
- Merchant create / edit / archive+restore, with organisation-role inheritance
- Membership invite / role change / removal, for both organisations and merchants
- Role enforcement: owner/admin manage, operator/viewer read-only, at both tiers
- Working-as context switching, server-verified, forged-id-proof
- Full cross-organisation data isolation (API layer and raw RLS, both confirmed)
- Branding inheritance across all three scopes, per-field, with the
  allow-merchant-branding gate
- Audit event logging for every mutating action, with immutability enforced
  at the database level
- All 34 migrations apply cleanly and repeatably
- Legacy `sync_company_to_organisation` trigger unaffected
- `/manage-it` route protection (fixed during this review)

## Failed / incomplete features

None remain outstanding as FAIL. Two real bugs were found during this review
and are now fixed and re-verified live (see "What changed" above):
`/manage-it` route protection (`middleware.ts` → `src/proxy.ts`), and
merchant branding silently skipping the organisation inheritance layer.

## Remaining technical debt (unchanged from the architecture doc, reconfirmed still accurate)

- Pre-existing 33 lint errors / 20 warnings in legacy files untouched by this
  sprint (`Sidebar.tsx`, `StandardOrderForm.tsx`, `WorkspaceSelector.tsx`, etc.)
- `draft_jobs` and other pre-existing operational tables still have no RLS —
  out of this sprint's scope, flagged again so it isn't lost
- `organisation_users` and `customer_portal_users` still exist as parallel,
  now-superseded identity tables (archive candidates, not touched this sprint)
- Branding asset pixel-dimension validation not implemented (file type/size
  are enforced)
- Recommend a one-time confirmation of `/manage-it` redirect behaviour on an
  actual Vercel deployment (not just this sandbox's `next start`), since
  Vercel's edge/serverless split for proxy functions is not perfectly
  identical to a local `next start`

## Recommendation

**Accept Sprint 1.** Every functional and security acceptance criterion in
the original brief has been demonstrated live — against a real Postgres
database with real RLS, a real running application (both `next dev` and
`next start`), real signed-in users, and real HTTP requests/responses, not
code inspection alone. Two real bugs were found by this process and are
fixed and re-verified. `npm run typecheck`, `npm run lint` (new code) and
`npm run build` all pass cleanly.
