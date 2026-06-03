-- ============================================================================
-- P2 quality feedback loop: thumbs up/down on signals
-- ----------------------------------------------------------------------------
-- Operators rate whether a surfaced signal was useful (+1) or noise (-1). Feeds
-- a precision metric over time and a future scoring-calibration dataset.
-- ============================================================================

alter table signals
  add column if not exists feedback smallint not null default 0;
