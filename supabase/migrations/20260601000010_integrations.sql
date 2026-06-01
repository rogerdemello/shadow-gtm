-- ============================================================================
-- Integrations: Slack, outbound webhooks, public API keys
-- ----------------------------------------------------------------------------
-- All three are admin-gated for writes (they hold secrets / control egress) but
-- members may read non-secret rows. api_keys store only a SHA-256 hash of the
-- key; the plaintext is shown once at creation and never persisted.
-- ============================================================================

create table integrations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  provider    text not null,                 -- 'slack'
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, provider)
);

create table webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs (id) on delete cascade,
  url             text not null,
  secret          text not null,             -- HMAC signing secret
  enabled         boolean not null default true,
  last_status     integer,                   -- last HTTP status (delivery log)
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now()
);
create index webhook_endpoints_org_idx on webhook_endpoints (org_id);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs (id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,         -- sha256(plaintext)
  prefix       text not null,                -- display-only, e.g. "sk_live_ab12"
  created_by   uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index api_keys_hash_idx on api_keys (key_hash);
create index api_keys_org_idx on api_keys (org_id);

alter table integrations       enable row level security;
alter table webhook_endpoints  enable row level security;
alter table api_keys           enable row level security;

-- Members read; owners/admins write (these hold secrets / control egress).
create policy "integrations_select" on integrations
  for select using (is_org_member(org_id));
create policy "integrations_admin_write" on integrations
  for all using (has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role[]));

create policy "webhook_endpoints_select" on webhook_endpoints
  for select using (is_org_member(org_id));
create policy "webhook_endpoints_admin_write" on webhook_endpoints
  for all using (has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role[]));

create policy "api_keys_select" on api_keys
  for select using (is_org_member(org_id));
create policy "api_keys_admin_write" on api_keys
  for all using (has_org_role(org_id, array['owner','admin']::member_role[]))
  with check (has_org_role(org_id, array['owner','admin']::member_role[]));
