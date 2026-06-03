-- ============================================================================
-- P1 observability: job failure categorization + AI-op latency/status
-- ----------------------------------------------------------------------------
-- scan_jobs gains a categorized error_code (so failures are aggregatable, not
-- just free-text), plus retry_count / last_retry_at for manual-retry history.
-- usage_events gains latency_ms + status so AI ops are diagnosable (cost AND
-- quality/health), powering /api/ai-ops.
-- ============================================================================

alter table scan_jobs
  add column if not exists error_code   text,
  add column if not exists retry_count  integer not null default 0,
  add column if not exists last_retry_at timestamptz;

alter table usage_events
  add column if not exists latency_ms integer,
  add column if not exists status     text not null default 'ok';

create index if not exists usage_events_status_idx on usage_events (org_id, status);
