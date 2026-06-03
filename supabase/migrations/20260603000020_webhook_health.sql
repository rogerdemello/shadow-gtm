-- ============================================================================
-- P1 delivery durability: auto-disable failing outbound webhooks
-- ----------------------------------------------------------------------------
-- Track consecutive delivery failures per endpoint. recordWebhookResult resets
-- the counter on a 2xx and increments it otherwise; after 3 in a row the
-- endpoint is disabled so a dead receiver stops getting retried every alert.
-- ============================================================================

alter table webhook_endpoints
  add column if not exists consecutive_failures integer not null default 0;
