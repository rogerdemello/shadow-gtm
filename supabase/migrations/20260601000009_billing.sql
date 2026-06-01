-- ============================================================================
-- Billing: subscriptions
-- ----------------------------------------------------------------------------
-- One row per org once they have a Stripe subscription. Absent row ⇒ free plan
-- (defaults applied in code). Members may READ their subscription; only the
-- service role (the Stripe webhook) writes it — there is no user write policy,
-- so RLS denies client writes while service_role bypasses RLS.
-- ============================================================================

create type plan_tier as enum ('free', 'startup', 'growth', 'enterprise');

create table subscriptions (
  org_id                 uuid primary key references orgs (id) on delete cascade,
  plan                   plan_tier not null default 'free',
  status                 text not null default 'active',
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index subscriptions_customer_idx on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;

-- Members can view their org's subscription; writes are service-role only.
create policy "subscriptions_member_select" on subscriptions
  for select using (is_org_member(org_id));
