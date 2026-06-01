-- ============================================================================
-- Attribute usage to a prompt version
-- ----------------------------------------------------------------------------
-- Lets us correlate extraction cost/quality with the prompt+schema version that
-- produced it (AI quality infrastructure, Phase 12).
-- ============================================================================

alter table usage_events
  add column if not exists prompt_version text;
