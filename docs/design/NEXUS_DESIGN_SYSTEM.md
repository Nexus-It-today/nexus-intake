# NEXUS Design System v1 (legacy chrome)

> **Scope note:** this document describes the legacy purple `AppShell`/
> `Sidebar`/`Header` chrome that still serves `/portal/*`, `/customer/*`, and
> other pre-Sprint-1 routes — unchanged by the "Nexus it today" rebrand. The
> newer `/app/*` platform shell (Manage it, Create it, Foundation it) uses a
> separate, calmer system with no dominant purple — see "NEXUS Design System
> v2" below and `src/components/platform/AppShellChrome.tsx`.

## Brand colours
- Primary colour: NEXUS Purple `#7C3AED`
- Graphite sidebar: `#111827`
- Light background: `#F3F4F6`
- White cards: `#FFFFFF`

## Status colours
- Success: `#22C55E`
- Warning: `#F59E0B`
- Issue: `#EF4444`
- Information: `#3B82F6`

## Navigation principles
- Icon-first sidebar
- Sidebar can later collapse to icons only
- Labels should be simple and customer-friendly
- Use:
  - Home
  - New Delivery
  - My Deliveries
  - Customers
  - Documents
  - Planning
  - Fleet
  - Warehouse
  - Finance
  - Reports
  - Settings
  - Support

## Customer language
- Use "Deliveries" instead of "Consignments" in customer-facing areas
- Use "New Delivery" instead of "Order Intake"
- Use "Submit Order" or "Send Delivery Request" instead of "Upload PDF"
- Use "Documents" instead of "Document Centre" where customer-facing
- Keep operational terms only for operations/admin pages

## Design principles
1. Customer first
2. Less words, more action
3. One clear purple brand language
4. Same components everywhere
5. iPad-friendly
6. Logistics companies and retail customers must both understand it

---

# NEXUS Design System v2 — "Nexus it today" platform shell (`/app/*`)

Introduced in Sprint 1 ("Foundation it") for the new platform surface —
Manage it, Create it, Foundation it (organisations, merchants, users,
branding, audit, integrations, commercial rules). Calm and professional,
deliberately **no dominant purple**, so it reads distinctly from the legacy
chrome above while both exist side by side.

## Brand colours
- Background: slate-50 `#F8FAFC`
- Header/cards: white, slate-200 borders
- Active/primary accent: blue-600/700 (`text-blue-700`/`bg-blue-50` for
  active nav state)
- Text: slate-900 (headings), slate-600 (body), slate-400 (muted/disabled)

## Brand mark
- Logo: `/brand/nexus-it-today-logo.png` (platform default), rendered via
  `src/components/platform/NexusLogo.tsx`, which resolves tenant-specific
  overrides first (organisation/merchant branding) and falls back to this
  asset — never a generated letter-avatar or broken image.
- Wordmark text: "Nexus it today".

## Navigation principles
- Flat left sidebar nav, no icon-only collapse (see `AppShellChrome.tsx`)
- Top-level products first (Manage it, Create it), then a "Foundation it"
  admin group (Organisations, Merchants, Users, Brand it, Integrate it,
  Commercial rules, Audit it, Settings), then a visibly-disabled
  "Coming later" section
- The "Working as" switcher and account menu live in the sticky header

## Design principles
1. Calm, professional, no dominant purple
2. One shared shell for every "it" module going forward
3. Server-verified access on every request — nothing trusted from client
   state alone
4. Tenant branding (logo/colour) inherits platform → organisation → merchant,
   with the Nexus it today mark always visible unless a future white-label
   plan says otherwise
