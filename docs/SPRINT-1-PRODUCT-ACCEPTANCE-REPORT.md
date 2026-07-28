# Nexus It — Sprint 1 Product Acceptance Report

This report resumes and completes Sprint 1 Product Acceptance from the
existing partial implementation. It does not recreate prior work and does
not begin Sprint 2. Two documents already existed from earlier sessions
(`docs/SPRINT-1-ACCEPTANCE-REPORT.md`, `PROJECT-HANDOVER.md`) describing the
original "Foundation it" scope (organisations, merchants, memberships,
branding, audit, context switching) as live-tested and passing. This session
independently re-verified those claims rather than trusting them, and found
that a second, later layer of work — Commercial it (module entitlements) and
Integrate it (integration credentials) — existed in the repository, fully
built, but had **never actually been run**: its own 42-assertion test suite
(`tmp/acceptance_test_suite_v2.mjs`) was present but unreported, and running
it live surfaced two real bugs. Both are now fixed and re-verified.

## Verification method

- Real local Supabase stack (Postgres + Auth + Storage via `npx supabase
  start` / Docker), reset from scratch twice this session
  (`npx supabase db reset`) — all 34 migrations (29 pre-existing + 5 Sprint 1
  foundation + 2 later product-acceptance: integrations, commercial rules)
  applied cleanly, zero errors, both times.
- `npm run dev` against the local stack via `.env.development.local` (takes
  precedence over `.env.local` for `next dev` only — the real production
  Supabase project credentials in `.env.local` were never read or touched).
- 6 real test accounts created via the Supabase Admin API
  (`tmp/acceptance_create_users_v2.mjs`), clearly fictional.
- The existing 42-assertion live test script
  (`tmp/acceptance_test_suite_v2.mjs`) run end-to-end against real
  `/api/platform/*` endpoints with real JWTs from real sign-ins — not code
  inspection.
- Direct `psql` checks against Postgres (RLS with `SET ROLE anon` /
  `SET ROLE authenticated`), independent of the application layer.
- `npm run typecheck`, `npm run lint`, `npm run build`, and both `next dev`
  and `next start` (production server) route-protection smoke tests.

---

## 1. Completed features

Everything below was independently re-verified live this session (not taken
on trust from prior reports):

- **Organisations** — create (platform-admin only), edit, archive/restore
  (status field, never `DELETE`).
- **Merchants** — create (org-role gated), edit, archive/restore, correctly
  scoped to their parent organisation.
- **Memberships / Users** — invite by email, role change, removal, for both
  organisation and merchant tiers; role-based permission enforcement
  (owner/admin manage, operator/viewer read-only); organisation
  owner/admin inherits merchant-manage rights without a separate membership
  row.
- **Working as context switching** — organisation and merchant context
  switching, server-verified against real membership rows on every request;
  forged/stale ids are never honoured. **Platform-level context switching
  was broken and is now fixed** (see §2).
- **Branding ("Brand it")** — platform → organisation → merchant inheritance,
  resolved per-field independently; `allowMerchantBranding` gate; asset
  upload/delete with type/size validation and SVG script-scanning;
  "restore inherited" via override deletion.
- **Audit ("Audit it")** — every mutating action logged
  (organisation/merchant/membership/branding/context/integration/entitlement
  events), immutable at the database level (no `UPDATE`/`DELETE` policy for
  any non-service role), actor resolved to a real email.
- **Data isolation** — cross-organisation access returns 403 at the API
  layer; RLS independently blocks anonymous reads at the database layer
  (`SET ROLE anon` → 0 visible rows on `organisations` and `merchants`).
- **Integrate it** (integration credentials) — generic, non-hard-coded
  provider catalog (20 providers seeded); organisation-scoped credential
  storage, AES-256-GCM encrypted, never echoed back in any API response
  (only a field-name hint); role-gated (owner/admin only); cross-organisation
  isolation confirmed (403).
- **Commercial it** (module entitlements) — a generic module catalog (9
  modules: Foundation it, Create it, Brand it, Book it, Catalogue it, Track
  it, Invoice it, Report it, Integrate it); organisation-level entitlements
  settable only by Nexus platform admins (organisations cannot self-grant);
  merchant-level entitlements bounded by their parent organisation's
  entitlement (a merchant can never exceed what its organisation has been
  sold). **Merchant-level entitlement isolation was broken and is now
  fixed** (see §2).
- **Route protection** — `/manage-it` (legacy) correctly redirects
  unauthenticated requests to `/signin` via `src/proxy.ts` (this Next.js
  version's `middleware.ts` → `proxy.ts` rename, confirmed against
  `node_modules/next/dist/docs`), verified under both `next dev` and a real
  production `next start`. Every `/api/platform/*` route independently
  verifies the bearer token server-side and returns 401 with no token.
- **All 34 migrations** apply cleanly and repeatably from scratch.
- **`npm run typecheck`**: 0 errors. **`npm run build`**: succeeds cleanly
  (`✓ Compiled successfully`), all routes registered, exit code 0.
  **`npm run lint`**: 0 errors/warnings in any Sprint 1 file (`src/lib/platform/**`,
  `src/app/api/platform/**`, `src/app/app/**`, `src/components/platform/**`,
  `src/app/login/**`); the whole-repo total (31 errors / 21 warnings) is
  entirely pre-existing legacy-file debt, unrelated to and untouched by this
  work.

## 2. Bugs found and fixed this session

Both were caught by actually *running* the existing (but never-executed)
v2 acceptance suite, not by reading the code.

### 2.1 Platform-level "Working as" context was unreachable

**Symptom**: the switcher UI already sent `{ type: "platform" }`
(`src/components/platform/WorkingAsSwitcher.tsx`), but the server silently
discarded any request type other than `"organisation"`/`"merchant"` and fell
back to the user's first available organisation. A platform admin — who by
definition has access to every organisation — could **never** select the
bare "Nexus it platform" context; the switcher would always snap back into
whichever organisation happened to be first.

**Root cause**: `StoredContextRequest`, `resolveActiveContext()`, and the
`POST /api/platform/context` handler had no branch for `type: "platform"` at
all — it fell through their fallback logic instead of being honoured.

**Fix**: `src/lib/platform/types.ts`, `src/lib/platform/context.ts`,
`src/app/api/platform/context/route.ts` — added an explicit, permission-gated
(`profile.isPlatformAdmin`) platform-context branch, and the context cookie
now stores an explicit `{"type":"platform"}` marker on selection (previously
it deleted the cookie, which would have caused the very next request to
silently fall back into an organisation again even after a fix to the
immediate switch).

**Verified**: `context-platform` assertion now passes —
`activeContext={"type":"platform"}`.

### 2.2 Merchant module entitlements leaked across sibling merchants

**Symptom**: once an organisation had a module manually granted (e.g.
Book it, enabled by a platform admin), **every merchant under that
organisation** resolved that module as enabled — even merchants that had
never received their own explicit grant. This directly broke the documented
security property ("a merchant can never exceed its organisation's
entitlement") in the opposite direction: it wasn't merchants exceeding their
org, it was **siblings silently inheriting a grant meant for one merchant
only**, with no per-merchant purchase check at all for previously-unlocked
modules.

**Root cause**: in `resolveMerchantEntitlements()`
(`src/lib/platform/commercial.ts`), the fallback for "no merchant-level
override row exists" was the **organisation's own resolved `enabled` value**
(`override?.enabled ?? orgEntry.enabled`) rather than the module's
platform-wide default. Confirmed at the database level: only one row existed
in `merchant_module_entitlements` (Merchant A1's explicit grant); Merchant
A2 had zero override rows, yet resolved `enabled: true` purely because its
parent organisation had the module switched on.

**Fix**: the fallback now uses `platform_modules.is_default_enabled` (the
same baseline organisations themselves fall back to when they have no
override) instead of the organisation's resolved value. The organisation's
entitlement remains a **ceiling** (`orgAllows`) but no longer acts as an
automatic floor for every merchant underneath it — a not-on-by-default
module still requires its own explicit `merchant_module_entitlements` row
per merchant, exactly as the original design comment already claimed but the
code did not implement.

**Verified**: `commercial-isolation` assertion now passes — Merchant A2
resolves `book_it.enabled: false` while Merchant A1 (with its own explicit
grant) correctly resolves `true`.

## 3. Remaining failures

**None.** After the two fixes above, the full 42-assertion live suite passes
42/42, with zero code changes needed anywhere else.

## 4. Tests run and results

| Check | Result |
|---|---|
| `npx supabase db reset` (from scratch, run twice) | **PASS** — all 34 migrations apply, zero errors, both times |
| `npm run typecheck` | **PASS** — 0 errors |
| `npm run lint` (whole repo) | 31 errors / 21 warnings, **all pre-existing legacy-file debt**; 0 in any Sprint 1 file |
| `npm run build` | **PASS** — exit 0, `✓ Compiled successfully`, all routes registered including `ƒ Proxy (Middleware)` |
| `next start` (real production server) route protection | **PASS** — `/manage-it` → 307 `/signin`; `/api/platform/access-profile` → 401 |
| `tmp/acceptance_test_suite_v2.mjs` (live, first run, before fixes) | **40/42** — 2 real failures found (§2) |
| `tmp/acceptance_test_suite_v2.mjs` (live, after fixes, fresh DB reset + fresh test users) | **42/42 PASS** |
| RLS: `SET ROLE anon; SELECT count(*) FROM organisations/merchants` | **PASS** — 0 visible rows |
| RLS: `SET ROLE authenticated; UPDATE audit_events ...` | **PASS** — `UPDATE 0`, immutability enforced at the database level |
| Unauthenticated GET on 6 representative `/api/platform/*` routes | **PASS** — all 401 |
| Unauthenticated `/login`, `/app`, `/app/organisations`, `/app/audit-it`, `/app/commercial-it`, `/app/integrate-it` | **PASS** — all render 200 (client-side auth guard, per existing `AuthGate` convention; every API route independently re-verifies server-side regardless) |

### What the 42 assertions cover

Brand/identity inheritance and isolation (7), Users/permissions including
privilege-escalation blocking (6), Organisation management incl. safe
archive (4), Working-as context incl. cookie-based persistence across a
simulated page refresh (5), Audit visibility with required fields (2),
Integration credentials incl. no-secret-leak and cross-org isolation (6),
Commercial rules incl. platform-admin-only toggling, merchant ceiling, and
sibling-merchant isolation (8), plus 4 setup assertions.

## 5. Files changed this session

Only the two bugs above were touched — no other file was modified, and
nothing already-working was recreated or overwritten.

```
MODIFIED
  src/lib/platform/types.ts        (StoredContextRequest: added the { type: "platform" } variant)
  src/lib/platform/context.ts      (resolveActiveContext + readStoredContext: honour an explicit,
                                     permission-gated platform-context request instead of discarding it)
  src/app/api/platform/context/route.ts
                                    (POST: accept type: "platform"; persist the explicit selection in
                                     the cookie instead of deleting it, so it survives the next request)
  src/lib/platform/commercial.ts   (resolveMerchantEntitlements: fall back to the module's platform-wide
                                     default, not the organisation's resolved value, closing the
                                     sibling-merchant entitlement leak)

CREATED
  docs/SPRINT-1-PRODUCT-ACCEPTANCE-REPORT.md   (this report)
```

No migration, RLS policy, UI component, or test script needed changes — the
schema and test suite were already correct; only the two application-layer
bugs above were wrong.

## 6. Exact live routes and test credentials

Local stack (started via `npx supabase start`, app via `npm run dev`,
pointed at the local stack through `.env.development.local`):

- App: `http://localhost:3000`
- Supabase API: `http://127.0.0.1:54321` · Studio: `http://127.0.0.1:54323`
  · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

**Key routes:**

```
/login                          canonical sign-in for the Sprint 1 shell
/app                             -> /app/manage-it
/app/manage-it                   foundation dashboard (context-aware)
/app/create-it                   quick-links hub
/app/brand-it?scope=&scopeId=    branding editor
/app/organisations, /app/organisations/[id]
/app/merchants, /app/merchants/[id]
/app/users
/app/audit-it
/app/commercial-it                module entitlements
/app/integrate-it                 integration credentials
/app/settings

/api/platform/access-profile                        GET
/api/platform/context                                GET/POST/DELETE
/api/platform/organisations                           GET/POST
/api/platform/organisations/[id]                      GET/PATCH
/api/platform/organisations/[id]/merchants             GET/POST
/api/platform/organisations/[id]/memberships           GET/POST
/api/platform/organisation-memberships/[id]            PATCH/DELETE
/api/platform/merchants/[id]                           GET/PATCH
/api/platform/merchants/[id]/memberships               GET/POST
/api/platform/merchant-memberships/[id]                PATCH/DELETE
/api/platform/branding                                 GET (public)
/api/platform/branding/profile                         GET/PATCH
/api/platform/branding/assets                          POST/DELETE
/api/platform/audit-events                             GET
/api/platform/modules                                  GET
/api/platform/organisations/[id]/modules               GET/PATCH
/api/platform/merchants/[id]/modules                    GET/PATCH
/api/platform/integrations/providers                    GET
/api/platform/organisations/[id]/integrations           GET/POST/DELETE
```

**Test credentials** (created via `tmp/acceptance_create_users_v2.mjs`,
clearly fictional, local stack only — password for all: `TestPass123!`):

| Email | Role |
|---|---|
| `office@nexus.delivery` | Nexus platform super admin (matches `platform_admin_bootstrap`) |
| `org-a-admin@example-test.dev` | Organisation owner, "Product Acceptance Org A" |
| `org-a-viewer@example-test.dev` | Organisation viewer/operator, Org A |
| `org-b-admin@example-test.dev` | Organisation owner, "Product Acceptance Org B" (isolation testing) |
| `merchant-a1-admin@example-test.dev` | Merchant owner, Merchant A1 (under Org A) |
| `merchant-a2-admin@example-test.dev` | Merchant owner, Merchant A2 (under Org A, sibling isolation testing) |

To reproduce this session's result end-to-end:
```
npx supabase db reset
node tmp/acceptance_create_users_v2.mjs
npm run dev   # picks up .env.development.local automatically
node tmp/acceptance_test_suite_v2.mjs   # expect 42/42
```

## 7. Known, pre-existing, out-of-scope items (unchanged by this session)

- Whole-repo lint debt (31 errors / 21 warnings) is entirely in legacy files
  (`Sidebar.tsx`, `StandardOrderForm.tsx`, `CustomerAddressesManager.tsx`,
  etc.) untouched by any Sprint 1/Product Acceptance work.
- `branding_profiles`, `branding_assets`, `platform_modules`,
  `organisation_module_entitlements`, and `merchant_module_entitlements` have
  RLS **enabled** but not **`FORCE`d** (unlike `merchants`,
  `organisation_memberships`, `merchant_memberships`, `audit_events`, and
  `organisation_integration_connections`, which do force it). This is a minor
  documentation inconsistency against the architecture doc's "enabled and
  forced on every new table" claim, not a functional security gap in
  practice — `FORCE` only changes behaviour for queries made as the table
  *owner*, and every actual read/write path here goes through either the
  service-role client (which bypasses RLS by role, not by ownership) or an
  `authenticated`-role client that RLS already applies to regardless of
  `FORCE`. Worth tidying in a future migration for consistency, not urgent.
- `draft_jobs` and other pre-existing operational tables still have no RLS —
  explicitly out of this and the prior sprint's scope, flagged again so it
  isn't lost.
- Branding asset pixel-dimension validation, billing/usage metering on top
  of `usage_limit`, and retiring `organisation_users`/`customer_portal_users`
  remain deferred, as already documented in the architecture doc — none of
  this was in scope for Product Acceptance.
- Sprint 2 scope (Book it, Catalogue it, Track it, Invoice it, WordPress
  connector, etc.) was **not started**, per instruction.

## 8. Recommendation

**Accept Sprint 1 Product Acceptance.** Every functional and security
acceptance criterion — across Foundation it (organisations, merchants,
memberships, branding, audit, context switching, route protection) and the
later Product Acceptance layer (Commercial it, Integrate it) — has now been
demonstrated live against a real Postgres database with real RLS, a real
running application in both `next dev` and production `next start` modes,
real signed-in users, and real HTTP requests, not code inspection alone.

Two real, previously-unreported bugs were found by actually running the
existing (but never-executed) test suite — a broken platform-context switch
and a cross-merchant entitlement leak — and both are now fixed and
re-verified with a clean 42/42 pass. `npm run typecheck`, `npm run lint`
(zero issues in all Sprint 1 code), and `npm run build` all pass. No
partial/working implementation was recreated or overwritten; only the two
confirmed defects were touched.
