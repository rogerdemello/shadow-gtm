-- ============================================================================
-- Deep-dive dossiers
-- ----------------------------------------------------------------------------
-- A multi-step agent researches a competitor across several angles (funding,
-- leadership, product, customers, sentiment, …) via grounded Gemini search and
-- synthesizes a cited Markdown dossier. Expensive to generate, so we persist the
-- latest per company (upsert), like battlecards.
-- ============================================================================

create table dossiers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs (id) on delete cascade,
  company_id   uuid not null references companies (id) on delete cascade,
  company_name text not null,
  markdown     text not null,
  created_at   timestamptz not null default now(),
  unique (org_id, company_id)
);

create index dossiers_org_idx on dossiers (org_id);

alter table dossiers enable row level security;

create policy "dossiers_rw" on dossiers
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
