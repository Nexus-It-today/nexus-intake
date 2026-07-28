This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database Setup

The application uses [Supabase](https://supabase.com) for its database. Schema changes are managed via migrations stored in `supabase/migrations/`.

### Prerequisites

- A Supabase project. Create one at [supabase.com](https://supabase.com).
- The Supabase CLI (included as a dev dependency — no global install required).

### Applying Migrations

1. **Link your Supabase project** (one-time setup):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

   Replace `<your-project-ref>` with the reference ID from your Supabase project settings (e.g. `abcdefghijklmnop`).

2. **Apply all pending migrations**:

   ```bash
   npx supabase db push
   ```

   This will create the `draft_jobs` table (and any future migrations) in your Supabase database.

### What the migrations create

| Migration | Creates |
|---|---|
| `20260627_create_draft_jobs_table.sql` | `draft_jobs` table, `idx_draft_jobs_company_id` index, `draft_jobs_updated_at` trigger |

#### `draft_jobs` table schema

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | Primary key, auto-generated |
| `company_id` | `UUID` | Required — enables multi-tenancy |
| `created_by_user_id` | `UUID` | Optional — set to the signed-in `profiles.id` value for authenticated uploads |
| `primary_document_id` | `UUID` | FK → `uploaded_documents(id)` |
| `status` | `TEXT` | `'document_uploaded'` or `'job_created'` |
| `created_at` | `TIMESTAMPTZ` | Auto-set on insert |
| `updated_at` | `TIMESTAMPTZ` | Auto-updated by trigger |

> **Note:** Row Level Security (RLS) is intentionally disabled in this migration. RLS policies are included as comments for when authentication is fully implemented.

### Further reading

- [Supabase CLI documentation](https://supabase.com/docs/reference/cli/introduction)
- [Supabase migrations guide](https://supabase.com/docs/guides/database/migrations)

## Nexus it platform foundation (Sprint 1 "Foundation it")

Nexus it is being rebuilt as a standalone multi-tenant SaaS platform. The
canonical hierarchy is:

```
Nexus it -> Customer organisation -> Merchant -> Users
```

Every customer is an ordinary organisation created through the app - never
hard-coded. The full architecture (tenancy model, identity model, roles,
"Working as" context switching, branding inheritance, RLS strategy, migration
plan and future-module compatibility) is documented in full at
[`docs/NEXUS-IT-PLATFORM-1.0-ARCHITECTURE.md`](docs/NEXUS-IT-PLATFORM-1.0-ARCHITECTURE.md).

### What's new

- `/login` - canonical sign-in for the new foundation shell.
- `/app/*` - the Sprint 1 application shell: Manage it, Create it, Brand it,
  Organisations, Merchants, Users, Audit it, Settings.
- `src/lib/platform/*` - server-verified access profile, "Working as" context
  resolution, audit logging and branding inheritance helpers.
- `src/app/api/platform/*` - the API surface backing the above.

### Environment variables

Copy `.env.example` to `.env.local` and fill in your own Supabase project
values. No new environment variables were introduced by Sprint 1 - the
foundation reuses the existing `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and
`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) variables.

### Development seed data

`supabase/seed_dev_foundation.sql` seeds two clearly-fictional example
organisations and merchants for local development only - never run it
against a production database, and never add real customer names to it.
Membership rows are deliberately not seeded by script; see the comments in
that file for why, and how to create them through the app's own invite flow
instead.
