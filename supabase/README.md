# Supabase — schema & migrations

Multi-tenant Postgres schema for Shadow GTM. Mirrors `lib/types.ts` and adds the
tenancy spine (`orgs` / `org_members` / `profiles`), Row-Level Security, and the
functions/triggers that back auth onboarding and append-only signal history.

## Migrations

| File | What it does |
|---|---|
| `20260530000001_init.sql` | Extensions, enums, all tables + indexes. |
| `20260530000002_rls.sql` | `is_org_member` / `has_org_role` helpers + RLS policies on every table. |
| `20260530000003_functions_triggers.sql` | `handle_new_user` (auto-profile), `create_org_with_owner` (onboarding RPC), `set_signals_not_current` (history flip). |

## Applying them

**Option A — Supabase SQL Editor (fastest to get going):**
Open your project → SQL Editor, paste each file's contents in order
(`…01`, `…02`, `…03`), and run.

**Option B — Supabase CLI (recommended for ongoing work):**
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies everything in supabase/migrations
```

## After applying

1. Put the project keys in `.env.local` (see `.env.local.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Regenerate the authoritative DB types (replaces the hand-authored placeholder):
   ```bash
   npx supabase gen types typescript --project-id <ref> > lib/db/database.types.ts
   ```
3. Enable Realtime on the `signals` and (later) `notifications` tables
   (Database → Replication) — needed for the live dashboard in Phase 5.

## Isolation model

- Every domain row carries `org_id`; RLS limits access to members of that org.
- The **service-role key** (background worker, Phase 4) **bypasses RLS** — code
  using `lib/db/service.ts` must scope every query by `org_id` itself.
- Signals are append-only: each scan inserts a fresh set and flips the prior
  set's `is_current` flag, so "now" stays coherent while history accrues.
