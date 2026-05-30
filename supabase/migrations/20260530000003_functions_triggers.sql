-- ============================================================================
-- Functions & triggers
-- ----------------------------------------------------------------------------
--  1. handle_new_user — mirror every new auth.users row into profiles.
--  2. create_org_with_owner — atomically create an org + owner membership
--     (used by onboarding in Phase 2; callable as an RPC).
--  3. set_signals_current — flip a company's prior signals to is_current=false.
--     The store inserts the new set in the same logical operation, keeping the
--     "current" picture coherent without losing history.
-- ============================================================================

-- ── 1. Auto-provision a profile on signup ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Create an org + make the caller its owner (atomic) ─────────────────────
create or replace function public.create_org_with_owner(org_name text, org_slug text default null)
returns orgs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org orgs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into orgs (name, slug, created_by)
  values (org_name, org_slug, auth.uid())
  returning * into new_org;

  insert into org_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

-- ── 3. Mark a company's existing signals as not-current ───────────────────────
-- The store calls this, then inserts the fresh scan's signals (is_current=true
-- by default). Runs as the invoking user, so RLS still applies.
create or replace function public.set_signals_not_current(target_company uuid)
returns void
language sql
as $$
  update signals set is_current = false
  where company_id = target_company and is_current = true;
$$;
