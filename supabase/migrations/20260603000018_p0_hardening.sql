-- ============================================================================
-- P0 hardening: scan_jobs retry RLS + Stripe webhook idempotency
-- ----------------------------------------------------------------------------
-- 1. scan_jobs only had select/insert policies, so retryJob()'s authed UPDATE
--    silently failed under RLS — "retry failed job" was broken. Add update +
--    delete policies matching the org-member pattern every other table uses.
-- 2. webhook_events dedupes Stripe deliveries: Stripe retries the same event on
--    any non-2xx (or timeout), which previously double-wrote the subscription.
--    The webhook now claims the event id here (insert-on-conflict-do-nothing)
--    and no-ops on replay. Service-role only (the webhook has no session); RLS
--    is enabled with no user policy so client access is denied by default.
-- ============================================================================

-- ── scan_jobs: members may update/delete their org's jobs (e.g. retry) ───────
create policy "scan_jobs_update" on scan_jobs
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "scan_jobs_delete" on scan_jobs
  for delete using (is_org_member(org_id));

-- ── Stripe webhook idempotency ──────────────────────────────────────────────
create table webhook_events (
  stripe_event_id text primary key,
  org_id          uuid references orgs (id) on delete set null,
  type            text not null,
  processed_at    timestamptz not null default now()
);

create index webhook_events_processed_idx on webhook_events (processed_at desc);

alter table webhook_events enable row level security;
-- No policies: only the Stripe webhook (service role, RLS-exempt) touches this.
