-- ============================================================================
-- Autonomous monitoring: schedules + scan job queue
-- ----------------------------------------------------------------------------
-- schedules: per-company (or per-org) cadence for background re-scans.
-- scan_jobs: the work queue the worker drains. pg_cron enqueues due jobs and
-- pings the worker route via pg_net (see supabase/cron-setup.sql).
-- ============================================================================

create type job_status as enum ('pending', 'running', 'done', 'failed');
create type schedule_cadence as enum ('hourly', 'daily', 'weekly');

-- ── Schedules ─────────────────────────────────────────────────────────────
-- company_id NULL = applies to every company in the org.
create table schedules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  company_id  uuid references companies (id) on delete cascade,
  cadence     schedule_cadence not null default 'daily',
  enabled     boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index schedules_due_idx on schedules (enabled, next_run_at);
create index schedules_org_idx on schedules (org_id);

-- ── Scan job queue ──────────────────────────────────────────────────────────
create table scan_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs (id) on delete cascade,
  company_id   uuid not null references companies (id) on delete cascade,
  scan_id      uuid references scans (id) on delete set null,
  status       job_status not null default 'pending',
  run_at       timestamptz not null default now(),
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index scan_jobs_due_idx on scan_jobs (status, run_at);
create index scan_jobs_org_idx on scan_jobs (org_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table schedules enable row level security;
alter table scan_jobs enable row level security;

-- Members manage their org's schedules; jobs are read-only to members (the
-- worker writes them via the service role, which bypasses RLS).
create policy "schedules_rw" on schedules
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "scan_jobs_select" on scan_jobs
  for select using (is_org_member(org_id));
create policy "scan_jobs_insert" on scan_jobs
  for insert with check (is_org_member(org_id));
