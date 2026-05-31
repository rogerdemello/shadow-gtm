-- ============================================================================
-- Alerting: notifications + alert rules
-- ----------------------------------------------------------------------------
-- notifications: in-app feed (and the source for email digests later). The
-- worker/scan inserts one when a signal crosses the org's opportunity threshold.
-- alert_rules: per-org thresholds + channels (one row per org; default applied
-- in code when absent).
-- The notifications table is added to the supabase_realtime publication so the
-- dashboard can subscribe and surface new alerts live without a refresh.
-- ============================================================================

create table alert_rules (
  org_id              uuid primary key references orgs (id) on delete cascade,
  min_opportunity     integer not null default 70,   -- 0–100
  channels            text[] not null default array['in_app'],
  digest_enabled      boolean not null default true,
  created_at          timestamptz not null default now()
);

create table notifications (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs (id) on delete cascade,
  signal_id         uuid references signals (id) on delete cascade,
  company_id        uuid references companies (id) on delete set null,
  company_name      text not null,
  kind              text not null default 'signal',
  title             text not null,
  body              text,
  opportunity_score integer,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index notifications_org_time_idx on notifications (org_id, created_at desc);
create index notifications_unread_idx on notifications (org_id, read_at);

alter table alert_rules    enable row level security;
alter table notifications  enable row level security;

create policy "alert_rules_rw" on alert_rules
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "notifications_rw" on notifications
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Stream new notifications to subscribed dashboards (Supabase Realtime).
alter publication supabase_realtime add table notifications;
