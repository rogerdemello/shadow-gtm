-- ============================================================================
-- Team invitations
-- ----------------------------------------------------------------------------
-- invitations: an email is invited to an org with a role. The invitee accepts
-- via the accept_invitation() RPC (SECURITY DEFINER) — they are not a member
-- yet, so member-gated RLS can't let them read the row directly; the function
-- validates the token + email + expiry and inserts the org_members row.
-- Management (list/create/revoke) is admin-gated by RLS.
-- ============================================================================

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  email       text not null,
  role        member_role not null default 'member',
  token       text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index invitations_org_idx on invitations (org_id, created_at desc);
create index invitations_token_idx on invitations (token);

alter table invitations enable row level security;

-- Owners/admins manage invitations within their own org.
create policy "invitations_admin_all" on invitations
  for all using (has_org_role(org_id, array['owner', 'admin']::member_role[]))
  with check (has_org_role(org_id, array['owner', 'admin']::member_role[]));

-- ── Accept an invitation (atomic, bypasses RLS for the not-yet-member) ────────
create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  uid uuid := auth.uid();
  uemail text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from invitations where token = invite_token;
  if inv.id is null then
    raise exception 'invitation not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invitation already accepted';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;

  select email into uemail from auth.users where id = uid;
  if lower(coalesce(uemail, '')) <> lower(inv.email) then
    raise exception 'invitation is for a different email address';
  end if;

  insert into org_members (org_id, user_id, role)
  values (inv.org_id, uid, inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update invitations set accepted_at = now() where id = inv.id;
  return inv.org_id;
end;
$$;
