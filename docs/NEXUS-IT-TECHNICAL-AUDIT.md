# Nexus It — Technical Audit

Read-only audit. No files were modified. Findings below cite exact paths/lines where useful.

**Tooling results:**
- `git status`: clean except uncommitted debug scripts in `tmp/` (18 untracked `.mjs` probe/smoke scripts + 1 modified) — operational debris, not app code.
- `npm run build`: ✅ succeeds. Next.js 16.2.9 (Turbopack), 140 routes (74 static, 66 API/dynamic).
- `npx tsc --noEmit` (no dedicated `typecheck` script exists): ✅ clean, zero errors.
- `npm run lint`: ❌ **33 errors, 20 warnings**. Almost all errors are the same class: `react-hooks/set-state-in-effect` (calling `setState` synchronously inside `useEffect` — a new stricter React 19/Next 16 lint rule) in `Sidebar.tsx`, `StandardOrderForm.tsx` (×2), `WorkspaceSelector.tsx` (×2), `SalesChannelField.tsx`, `CustomerAddressesManager.tsx` (×2), and several `/manage-it/document-it` call sites. Warnings are mostly unused vars/imports. No blocking type errors — this is a real but mechanical cleanup job, not architectural rot.

---

## 1. Current Architecture Summary

**Stack**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind 4, Supabase (Postgres + Auth + Storage), deployed to Vercel (linked project `nexus-intake`, org `team_1L0AN8wirg3HofoA3uQrox97`), no `vercel.json` (no custom routing/domain config).

**What it actually is today**: a single-tenant-feeling app that has *company_id-scoped* data underneath, being incrementally converted toward true multi-tenancy. There are **three identity/tenancy models coexisting**:

1. **`profiles` + `companies`** (original) — `auth.users` ↔ `profiles.company_id` ↔ `companies`. Drives the merchant/ops side (`getMerchantContext` in `serverAuth.ts`).
2. **`customer_portal_users` + `merchant_customers`** (Sprint 2) — a merchant's *own* customers get portal logins, keyed by `company_id` + `merchant_customer_id` (`customerPortalAuth.ts`). This is a second, parallel identity table, not a role on `profiles`.
3. **`organisations` + `organisation_users`** (newest, `20260706103000_organisation_foundation.sql`) — introduced as "the canonical tenant root" going forward, but implemented as a **bolt-on**: every existing table gets a nullable `organisation_id` column, backfilled `= company_id`, kept in sync by a generic trigger (`sync_organisation_company_ids()`) rather than by replacing `company_id`. `company_id` and `organisation_id` are mirrored on every write, not unified.

**Route surface**: two overlapping IAs. A flat, old "verb-it" nav (`/create-it`, `/process-it`, `/track-it`, `/manage-it`, `/account-it`, `/report-it`, `/store-it`, `/document-it`, `/order-input`, `/orders`, `/customers`, `/settings`, `/reports`…) sits alongside a newer, more conventional `/portal/*` tree (`/portal/orders`, `/portal/customers`, `/portal/documents`, `/portal/settings`…) that largely duplicates it. `AppShell.tsx`'s hardcoded `adminNavItems` drives the old nav via query-string "sections" (e.g. `/manage-it?section=companies`) rather than real routes.

**Auth enforcement**: `middleware.ts` **only** guards `/manage-it/*` (cookie-based session + access-flag check). Every other route's auth/redirect logic lives client-side in `AuthGate.tsx`, a client component wrapping the whole tree in `layout.tsx`. API routes each do their own token verification (`getMerchantContext`, `getCustomerPortalContext`, ad hoc checks in `intake/orders`). There is no server-side page gating outside `/manage-it` — protection for everything else rests entirely on client JS redirects + API-layer checks + (where present) RLS.

**Integrations model** is genuinely well-designed and already matches the target vision: a global `integration_providers` catalog (19 seeded providers — Xero, Stripe, WooCommerce, Shopify, Track-POD, etc.) plus per-company `merchant_integration_connections` with encrypted credential storage (`credentials_ciphertext/iv/tag`). `docs/architecture/NEXUS_PLATFORM_PRINCIPLES.md` already articulates almost exactly the "Nexus owns the core experience, external systems are replaceable connectors" model you're asking to formalize — this doc is a strong asset, not something to write from scratch.

**Booking/intake** already funnels multiple entry points (`/create-it`, `/booking-forms/{doorway,public,embedded,shopify,woocommerce}`, `/order-input`) through one `StandardOrderForm` component into one `/api/intake/orders` endpoint, which resolves `company_id` from the bearer token and delegates to `intakeService.processIntake()`. The `/booking-forms/embedded` route is explicitly built to be iframed. This is a solid foundation for "Nexus-hosted forms, embeddable via iframe/JS" — there is currently **no WordPress plugin/shortcode support at all** (confirmed via grep — zero hits) — that's greenfield work, not a rebuild.

---

## 2. Route Map (condensed from the build output)

| Area | Routes | Notes |
|---|---|---|
| Public/marketing shell | `/`, `/support` | Static |
| Auth | `/signin`, `/signup`, `/auth/login`, `/auth/signup`, `/auth/beta`, `/auth/callback`, `/forgot-password`, `/reset-password` | Two parallel auth entry points (`/signin` vs `/auth/login`, `/signup` vs `/auth/signup`) — duplication |
| Onboarding | `/onboarding` | Single customer-type onboarding flow |
| Legacy "verb-it" ops nav | `/create-it`, `/process-it`, `/track-it`, `/manage-it(+[section])`, `/account-it(+subpages)`, `/report-it`, `/store-it`, `/document-it`, `/build-it(+[section])`, `/improve-it(+[section])`, `/need-it(+[section])`, `/integrate-it`, `/model-it`, `/route-it`, `/send-it`, `/tell-it`, `/get-it`, `/review-it`, `/choose-it`, `/communicate-it` | Large surface of "-it" branded pages, several are thin/placeholder (`FinanceSnapshotPlaceholder`, `ActiveRoutesPlaceholder`, `OperationsMapPlaceholder`, `RecentAlertsPlaceholder`) |
| Newer portal IA | `/portal/*` (~25 routes: orders, customers, documents(+review), addresses, catalogue-it, price-it, notify-it, discuss-it, booking-forms, booking-templates, draft-orders, integrate-it, market-it, reports, settings, track-it, woocommerce-imports) | Overlaps heavily with the verb-it nav above |
| **Hardcoded customer pages** | `/customers`, `/customers/di-designs`, `/customers/nook-home`, `/customers/doorway-group` | **Fully static mock data** — literal company names (`DI Designs LTD`, `BLB Group LTD` trading as `Nook Home`, `Doorway Group LTD`) hardcoded in `page.tsx` files, not read from the DB. Direct violation of "customers must not be hardcoded." |
| Booking/embed | `/booking-forms`, `/booking-forms/{doorway,public,embedded,shopify,woocommerce}`, `/order-input(+/status)` | Real functional foundation for embeddable forms |
| Customer self-service | `/customer(+/documents,/invoices,/notifications,/orders,/track-order)` | End-customer portal, separate from merchant `/portal` |
| Misc top-level duplicates | `/orders`, `/reports`, `/settings`, `/customers`, `/merchants`, `/consignments`, `/warehouse`, `/drivers`, `/finance` | Each has a `/portal/...` equivalent — pick one IA |
| Debug | `/debug/ocr-review-preview`, `/api/debug/list-storage`, `/api/debug/signed-url` | Dev-only, should not ship to prod |
| API — 40+ routes under `/api/{account-it,admin,auth,catalogue,customer,document-it,intake,jobs,manage-it,maps,merchant,merchant-documents,orders,price-it,process-it,reference,trackpod,woocommerce}/*` | | Reasonably organized by domain; naming mixes "-it" branding into API paths (couples API contract to UI branding) |

---

## 3. Database & RLS Map

**29 migrations**, June 26 – July 6 2026. Full table inventory, tenancy analysis, and per-table RLS policy audit was done in depth (see companion detail below — summarized here for the report).

**Tenancy pattern**: `company_id UUID NOT NULL` on almost every table, but **with no FK constraint to `companies`** anywhere except the original bootstrap tables — it's a soft key enforced only by app code / RLS subqueries. `organisation_id` was added everywhere as a nullable, trigger-synced shadow column in the final migration — a bridge to true multi-tenancy, not a completed cutover.

**RLS — the most important finding**: RLS is enabled and correctly scoped (`company_id IN (SELECT company_id FROM profiles WHERE auth_user_id = auth.uid())`) for `companies`, `profiles`, `customers`, `uploaded_documents`, the `document_it_workflow` tables, and the `model_it_self_service` tables. But **RLS was never enabled** on:
- **`draft_jobs`** — the central operational table (order/job record, ~90 columns, PII, commercial data). The original migration even has commented-out RLS policy code with `-- Future: Enable RLS when auth is implemented`; it was never followed up across 9 subsequent alterations of this same table.
- `merchant_goods_catalogue`, `merchant_catalogue_items`, `merchant_price_it_commercial`, `sales_channels`
- `notify_it_conversations`, `notify_it_messages`, `discuss_it_timeline`, `operations_notifications`, `draft_job_schedule_overrides` (the last two also have **no tenant column at all**)
- `merchant_collection_profiles`, `merchant_customers`, `merchant_customer_invitations`, `merchant_customer_addresses`, `merchant_customer_booking_profiles`, `customer_portal_users`
- `merchant_integration_connections` — **holds encrypted third-party API credentials with a `company_id` column but zero RLS.**

That's essentially every feature shipped between Catalogue It / Price It / Notify It / Discuss It / merchant CRM / Integrate It (July 1–4) — about two weeks of feature work — with tenant columns present in schema but not enforced by Postgres. Whether this is currently exploitable depends on whether the app ever queries these tables with the anon/authenticated Supabase key rather than the service-role key; either way it's a database-level gap that should not persist into a real multi-tenant product.

One bright spot: the newest migration (`organisation_foundation`) uses `FORCE ROW LEVEL SECURITY` on `organisations`/`organisation_users` — stricter than everything before it, suggesting improving practice, just not yet retroactively applied.

**Other schema debt**: `draft_jobs` has been altered by ~9 migrations, with two pairs of migrations (`intake_operational_columns` / `final_intake_draft_jobs_alignment`, and `route_status_eta_sync_fields` / `document_it_route_visibility_fields`) each re-declaring the same columns hours apart — evidence of drift between environments needing defensive catch-up migrations. `merchant_customer_addresses.address_type` was widened three separate times. `merchant_collection_profiles` had its one-profile-per-company UNIQUE constraint reversed. `supabase/types.ts` (generated types) is **empty (0 bytes)** — stale/never regenerated. `supabase/reset_test_environment.sql` references tables that no longer exist under those names (`notifications`, `catalogue_items`) and misses most newer tables — it's not safe to run as-is.

**Hardcoded tenant data in migrations**: `office@nexus.delivery` is baked into `platform_admin_bootstrap` (auto-grants `super_admin` on signup — fine for a real platform owner account, but should move to an env var or dashboard-configured value, not a migration literal). `organisation_foundation.sql` hardcodes two seed organisations directly in DDL: `nexus-delivery-solutions` and `the-home-delivery-guys` — this is very likely the origin of "NDT"/"THDG" — real/demo tenant identities embedded in schema migrations that would run against *every* environment, including future customers' databases.

---

## 4. Authentication & Permissions Map

- **Supabase Auth** (`auth.users`) is the identity root for all three parallel models above.
- **Role model**: `roles`/`permissions`/`role_permissions`/`user_roles` tables (global, not tenant-scoped) plus a `has_permission(user_id, slug)` SQL function used throughout RLS and app code. 10 roles seeded, but only `super_admin` (all permissions) and `company_admin` (curated subset) and `user` (one permission) actually have assignments — `planner`, `driver`, `warehouse_operative`, `customer_service`, `finance`, `read_only_customer`, `api_user` are schema placeholders with no wired permissions or UI.
- **`profiles.role`** (a free-text/CHECK column: `super_admin | company_admin | operations | customer`) is a *second*, independent role signal used by `serverAuth.ts`'s `normalizeProfileRole()` — it doesn't consult `has_permission()` at all. So there are two separate authorization mechanisms (`user_roles`/`permissions` RPC-based, and `profiles.role` string-based) used in different parts of the codebase.
- **Session flow**: client signs in via Supabase JS → `AuthGate.tsx` (client-side, wraps entire app) resolves user/profile and redirects → also POSTs the access token to `/api/auth/session` to set two cookies (`nexus-session-token`, `nexus-manage-it`) that `middleware.ts` checks, but **only for `/manage-it`**. Every other server component/page has no equivalent server-side gate.
- **Customer-vs-merchant split**: `merchant_customers` (a merchant's own customer book) is distinct from `customers` (the tenant/company record itself) — naming here is genuinely confusing and worth renaming in any rebuild (`customers` reads like "the merchant's customers" but is actually "the company/tenant").
- **manage-it "super admin" cookie gate** is coarse: one boolean cookie (`canAccessManageIt`), not permission-specific, despite `MANAGE_IT_SECTIONS` in `manageIt.ts` defining per-section `requiredPermission` strings that are (correctly) checked client-side via `getVisibleManageItSections()` — but not enforced server-side per section.

---

## 5. KEEP / REBUILD / REMOVE / ARCHIVE

| Area | Verdict | Why |
|---|---|---|
| Next.js App Router structure, Turbopack build, TS/Tailwind setup | **KEEP** | Builds clean, modern stack, no reason to change |
| `integration_providers` / `merchant_integration_connections` model | **KEEP** | Already the right shape for the "connectors" architecture — extend, don't rebuild |
| `/booking-forms` hub + `StandardOrderForm` + `/api/intake/orders` | **KEEP, extend** | Right foundation for Nexus-hosted embeddable forms; needs iframe/JS-embed hardening + WordPress shortcode plugin added |
| `manage_it_permissions` schema (roles/permissions/functions) | **KEEP, finish wiring** | Good design (`has_permission()`, `SECURITY DEFINER` functions); needs full role coverage and consistent use instead of the parallel `profiles.role` string check |
| `organisations` / `organisation_users` + sync triggers | **REBUILD (complete the cutover)** | Right direction, half-finished. Needs to become the sole tenant root with `company_id` either removed or turned into a pure display/legacy alias, FK-constrained, NOT NULL |
| RLS on `draft_jobs`, catalogue/pricing/notify/CRM/integrations tables | **REBUILD (urgent)** | Tenant columns exist, enforcement doesn't — this is the top priority fix, independent of any UI rework |
| Hardcoded `/customers`, `/customers/di-designs`, `/customers/nook-home`, `/customers/doorway-group` | **REMOVE** | Static mock pages with literal company names; replace with a DB-driven, generic customer/tenant list |
| Duplicate "-it" flat nav vs `/portal/*` tree | **REBUILD (consolidate)** | Pick one IA (recommend `/portal/*` conventions) and either delete or redirect the legacy verb-it routes |
| Duplicate auth entry points (`/signin` vs `/auth/login`, `/signup` vs `/auth/signup`) | **REMOVE (consolidate to one pair)** | Confusing, doubles maintenance surface |
| Client-side-only `AuthGate` for all non-`/manage-it` routes | **REBUILD** | Move page-level auth to middleware/server components; keep client gate only as UX polish, not the security boundary |
| `merchant_customers` vs `customers` naming | **REBUILD (rename)** | Rename `customers` → `tenants`/`companies` record and keep `merchant_customers` as-is, to remove ambiguity |
| `TRACKPOD_API_KEY` as a single global env var | **REBUILD** | Should become per-tenant credentials in `merchant_integration_connections` like every other provider, or explicitly documented as a deliberate platform-level default |
| Lint errors (`set-state-in-effect` ×8, unused vars, one `any`) | **REBUILD (quick pass)** | Mechanical fix, not architectural, but should be zero before any real rebuild sprint starts |
| `supabase/types.ts` | **REBUILD (regenerate)** | Currently empty; regenerate from live schema and wire into CI |
| `supabase/reset_test_environment.sql` | **REBUILD or REMOVE** | References stale table names, missing most newer tables; either fix or delete in favor of a proper seed/reset script |
| `docs/architecture/NEXUS_PLATFORM_PRINCIPLES.md`, `MODEL_IT_SELF_SERVICE_PLATFORM.md` | **KEEP** | Already states almost exactly the target multi-tenant/connector vision — use as the north star doc, don't rewrite from scratch |
| `docs/AUTH_FIX.md`, `SPRINT1_WODELY_REPLACEMENT_AUDIT.md` | **ARCHIVE** | Historical postmortems, useful context, not living docs |
| `reference/` (airtable, make/blueprints, trackpod, xero, field-mapping, flows — 33 files) | **ARCHIVE** | Legacy system reference material (the prior Wodely/Make.com/Airtable-based process this is replacing) — valuable for migration mapping, not app code |
| `screenshots/` | **ARCHIVE** | Product screenshots for docs/design reference |
| `debug/signed-url-route-review.ts` (top-level, outside `src/`) | **REMOVE** | Stray one-off debug script |
| `tmp/*.mjs` probe/smoke scripts (18 files) + test PDFs/screenshots | **REMOVE (from repo tracking)** | Operational debugging debris; fine to keep locally, shouldn't be committed |
| `merchantMockData.ts`, `productHubMockData.ts` | **REMOVE once real data wired** | Generic (non-tenant-specific) placeholder mocks — lower risk than the hardcoded customer pages, but still to retire before launch |

---

## 6. Risks and Broken Areas

1. **RLS gap on `draft_jobs` and ~14 other tables is the single biggest risk.** It's the core operational table (orders/jobs, customer PII, commercial data) and has never had row-level security since its creation five migrations before RLS was even introduced elsewhere. This must be closed before onboarding any real second tenant.
2. **Dual company_id/organisation_id tenancy, kept consistent only by triggers.** Any raw SQL, any service-role write path, or any table the sync-trigger loop missed will silently desynchronize the two IDs. This is inherently fragile as a long-term state — it should be a transitional step with a hard deadline, not a resting architecture.
3. **Hardcoded tenant identities in migrations and pages** (`nexus-delivery-solutions`, `the-home-delivery-guys` in SQL; `DI Designs LTD`, `Nook Home`, `Doorway Group LTD` in React) directly contradict the "customers are ordinary tenants, not hardcoded" requirement and would need removing before any new customer onboarding.
4. **No server-side auth boundary except `/manage-it`.** Everything else relies on a client component (`AuthGate`) plus per-route API checks. Functionally works today, but it's not defense-in-depth, and middleware-based tenant/session resolution will be needed anyway once custom domains or WordPress embeds are in play.
5. **Two authorization mechanisms in parallel** (`has_permission()`/`user_roles` vs. `profiles.role` string matching in `serverAuth.ts`) — a permission change in one place can silently not apply in the other.
6. **No WordPress/shortcode support exists yet** — greenfield, not a bug, but flagged since it's explicitly in your target architecture.
7. **Single global `TRACKPOD_API_KEY`** suggests Track-POD is currently wired as one shared account across all tenants, inconsistent with the multi-tenant connector model already built for every other provider.
8. **`supabase/types.ts` is empty** — any code trusting generated types is actually untyped; regenerate before relying on it further.
9. **Lint is not currently clean** (33 errors) — not urgent, but should be zero before a "clean first sprint" starts so real changes aren't buried in pre-existing noise.
10. **IA duplication** (`-it` flat nav vs `/portal/*`, `/customers` vs `/portal/customers`, `/orders` vs `/portal/orders`, two sign-in flows) creates ambiguity about which surface is canonical — worth resolving early since it affects where new multi-tenant work should land.

---

## 7. Proposed Clean First Sprint

Goal: make the platform *safely* multi-tenant-ready without a rewrite — close the security gap, finish the tenancy model that's already 80% built, and remove the hardcoded customers, before adding any new customer-facing surface.

1. **Enable and verify RLS** on `draft_jobs` and the other ~14 tables identified in §3, using the existing, proven `company_id IN (SELECT company_id FROM profiles WHERE auth_user_id = auth.uid())` pattern already used elsewhere. This alone is worth doing before anything else.
2. **Finish the organisation cutover**: make `organisation_id` `NOT NULL` + FK-constrained on all tables once backfilled, decide whether `company_id` becomes a deprecated alias or is dropped, and remove reliance on the mirror-sync trigger as the long-term mechanism.
3. **Remove the hardcoded `/customers*` pages** and replace with a single DB-driven tenant/customer list (reads from `companies`/`organisations`, no literal company names in code).
4. **Consolidate auth entry points** to one sign-in/sign-up pair and **move page-level route protection into middleware** (host- or session-aware), keeping `AuthGate` for UX only.
5. **Unify the two authorization mechanisms** — pick `has_permission()`/`user_roles` as the single source of truth and stop branching on `profiles.role` strings in `serverAuth.ts`.
6. **Clear the lint backlog** (mechanical `set-state-in-effect` fixes + unused vars) so the codebase is a clean baseline for the sprint's actual changes.
7. **Regenerate `supabase/types.ts`** and wire type generation into the normal migration workflow.
8. **Decide and document the canonical IA** (recommend keeping `/portal/*` and retiring/redirecting the flat "-it" duplicates), so subsequent multi-tenant UI work has one home.

Everything else (WordPress shortcode plugin, per-tenant Track-POD credentials, IA cleanup execution, mock-data removal) is real but sequenced *after* the above, since they build on a tenancy/security model that isn't safe to extend yet.
