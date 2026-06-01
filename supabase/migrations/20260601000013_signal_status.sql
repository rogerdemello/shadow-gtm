-- ============================================================================
-- Signal workflow status
-- ----------------------------------------------------------------------------
-- Lets a team triage the feed: mark a signal handled or dismiss it so it drops
-- out of the active view (restorable). Status is per-signal-instance; a re-scan
-- replaces the current set with fresh "active" signals, so dismissals naturally
-- apply only to the scan that produced them.
-- ============================================================================

create type signal_status as enum ('active', 'handled', 'dismissed');

alter table signals
  add column if not exists status signal_status not null default 'active';
