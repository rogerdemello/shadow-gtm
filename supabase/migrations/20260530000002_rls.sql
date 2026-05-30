-- ============================================================================
-- Row-Level Security — tenant isolation
-- ----------------------------------------------------------------------------
-- Every domain table is readable/writable only by members of the owning org.
-- The service_role key (used by the background worker) bypasses RLS entirely,
-- so the worker must scope every query by the job's org_id itself.
--
-- is_org_member() is SECURITY DEFINER so the policy can read org_members without
-- recursively re-triggering org_members' own RLS.
-- ============================================================================

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_members.org_id = target_org
      and org_members.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org uuid, roles member_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_members.org_id = target_org
      and org_members.user_id = auth.uid()
      and org_members.role = any(roles)
  );
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table orgs          enable row level security;
alter table org_members   enable row level security;
alter table companies     enable row level security;
alter table snapshots     enable row level security;
alter table scans         enable row level security;
alter table signals       enable row level security;
alter table scan_evidence enable row level security;
alter table battlecards   enable row level security;

-- ── profiles: a user sees/edits only their own profile ───────────────────────
create policy "profiles_self_select" on profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on profiles
  for update using (id = auth.uid());

-- ── orgs: members can read; any authed user can create; owners/admins update ──
create policy "orgs_member_select" on orgs
  for select using (is_org_member(id));
create policy "orgs_insert_authed" on orgs
  for insert with check (auth.uid() = created_by);
create policy "orgs_admin_update" on orgs
  for update using (has_org_role(id, array['owner','admin']::member_role[]));

-- ── org_members: members read the roster; owners/admins manage it ─────────────
create policy "members_select" on org_members
  for select using (is_org_member(org_id));
create policy "members_admin_write" on org_members
  for all using (has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role[]));

-- ── Domain tables: full access scoped to org membership ───────────────────────
-- Same shape for each: select/insert/update/delete gated on is_org_member(org_id).
create policy "companies_rw" on companies
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "snapshots_rw" on snapshots
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "scans_rw" on scans
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "signals_rw" on signals
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "scan_evidence_rw" on scan_evidence
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "battlecards_rw" on battlecards
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
