-- ============================================================================
-- Usage metering
-- ----------------------------------------------------------------------------
-- One row per billable/meterable operation (a Gemini extraction, a battlecard,
-- a Bright Data fetch, …). Feeds cost dashboards now and plan quotas in Phase 7.
-- Org-scoped + RLS like every other table.
-- ============================================================================

create table usage_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  kind        text not null,                 -- e.g. 'gemini_extraction'
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  units       integer not null default 1,    -- generic count (e.g. # requests)
  scan_id     uuid references scans (id) on delete set null,
  company_id  uuid references companies (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index usage_events_org_time_idx on usage_events (org_id, created_at desc);
create index usage_events_kind_idx on usage_events (org_id, kind, created_at desc);

alter table usage_events enable row level security;

create policy "usage_events_rw" on usage_events
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
