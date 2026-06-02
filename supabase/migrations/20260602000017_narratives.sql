-- ============================================================================
-- Market-narrative memo
-- ----------------------------------------------------------------------------
-- One current cross-competitor "state of the market" memo per org (upsert).
-- ============================================================================

create table narratives (
  org_id     uuid primary key references orgs (id) on delete cascade,
  markdown   text not null,
  created_at timestamptz not null default now()
);

alter table narratives enable row level security;

create policy "narratives_rw" on narratives
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
