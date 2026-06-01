-- ============================================================================
-- Weekly digest tracking
-- ----------------------------------------------------------------------------
-- Track when each org last received its weekly digest so the worker can send
-- it at most once per 7 days. Nullable: a fresh org has never received one.
-- ============================================================================

alter table alert_rules
  add column if not exists last_digest_at timestamptz;
