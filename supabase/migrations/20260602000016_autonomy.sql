-- ============================================================================
-- Proactive autonomy
-- ----------------------------------------------------------------------------
-- autonomy_level on alert_rules opts an org into the post-scan triage agent
-- (and, at 'deep_dive', autonomous dossiers on spiking competitors).
-- scan_jobs.kind lets the worker run 'dossier' jobs, not just 'scan' jobs.
-- ============================================================================

create type autonomy_level as enum ('none', 'triage', 'deep_dive');

alter table alert_rules
  add column if not exists autonomy_level autonomy_level not null default 'none';

alter table scan_jobs
  add column if not exists kind text not null default 'scan';
