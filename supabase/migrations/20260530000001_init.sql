-- ============================================================================
-- Shadow GTM — initial schema (multi-tenant)
-- ----------------------------------------------------------------------------
-- Mirrors lib/types.ts, plus the tenancy spine (orgs / org_members / profiles).
-- Every domain row carries org_id; RLS (see 20260530000002_rls.sql) enforces
-- isolation. Signals are APPEND-ONLY history: each scan inserts a fresh set and
-- flips the previous set's is_current flag, so the dashboard shows "now" while
-- history accrues for trend analysis (the data moat).
-- ============================================================================

create extension if not exists "pgcrypto";          -- gen_random_uuid()

-- ── Enums ───────────────────────────────────────────────────────────────────
create type signal_type as enum (
  'pricing', 'product', 'hiring', 'sentiment',
  'funding', 'messaging', 'intent', 'risk'
);
create type impact_level as enum ('high', 'medium', 'low');
create type page_type as enum ('pricing', 'homepage');
create type member_role as enum ('owner', 'admin', 'member');

-- ── Tenancy ───────────────────────────────────────────────────────────────
-- One row per auth user; created automatically by a trigger (see functions mig).
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on org_members (user_id);

-- ── Domain: competitors on the watchlist ────────────────────────────────────
create table companies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  name        text not null,
  domain      text not null,
  pricing_url text not null,
  render_js   boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, domain)            -- DuplicateCompanyError is now a DB invariant
);

create index companies_org_idx on companies (org_id);

-- ── Page snapshots (for "what changed since last scan?") ─────────────────────
create table snapshots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  company_id  uuid not null references companies (id) on delete cascade,
  page_type   page_type not null,
  url         text not null,
  text        text not null,
  hash        text not null,
  fetched_at  timestamptz not null default now()
);

create index snapshots_lookup_idx
  on snapshots (company_id, page_type, fetched_at desc);

-- ── Scans ─────────────────────────────────────────────────────────────────
create table scans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs (id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  company_ids  uuid[] not null default '{}',
  signal_count integer not null default 0
);

create index scans_org_idx on scans (org_id, started_at desc);

-- ── Signals (append-only history) ────────────────────────────────────────────
create table signals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs (id) on delete cascade,
  company_id         uuid not null references companies (id) on delete cascade,
  company_name       text not null,
  scan_id            uuid references scans (id) on delete set null,
  type               signal_type not null,
  description        text not null,
  impact             impact_level not null,
  confidence         numeric(4, 3) not null,         -- 0.000–1.000
  opportunity_score  integer not null,               -- 0–100, drives ranking
  reasoning          text not null,
  recommended_action text not null,
  source_url         text not null,
  quote              text,
  is_current         boolean not null default true,  -- latest scan's set?
  created_at         timestamptz not null default now()
);

create index signals_current_idx
  on signals (org_id, company_id, is_current);
create index signals_history_idx
  on signals (org_id, company_id, created_at desc);

-- ── Evidence (what fed each company's scan) ───────────────────────────────────
-- Append-only: getEvidence returns the most recent row per company; older rows
-- remain for the audit trail (Phase 6).
create table scan_evidence (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs (id) on delete cascade,
  company_id     uuid not null references companies (id) on delete cascade,
  scan_id        uuid references scans (id) on delete set null,
  change_summary text,
  serp           jsonb not null default '[]',     -- SerpEvidence[]
  sources        jsonb not null default '[]',     -- { url, pageType }[]
  created_at     timestamptz not null default now()
);

create index scan_evidence_lookup_idx
  on scan_evidence (org_id, company_id, created_at desc);

-- ── Battlecards (latest per company) ──────────────────────────────────────────
create table battlecards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  company_id    uuid not null references companies (id) on delete cascade,
  company_name  text not null,
  markdown      text not null,
  created_at    timestamptz not null default now(),
  unique (org_id, company_id)        -- one current card per competitor (upsert)
);
