-- ============================================================================
-- Analyst conversation memory (Ask Shadow)
-- ----------------------------------------------------------------------------
-- One row per chat; messages stored as a JSONB array (chat history is small and
-- always read/written whole). Org-scoped + RLS.
-- ============================================================================

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  title       text not null,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index conversations_org_idx on conversations (org_id, updated_at desc);

alter table conversations enable row level security;

create policy "conversations_rw" on conversations
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
