-- ============================================================================
-- Autonomous monitoring: pg_cron + pg_net wiring  (run AFTER deploying)
-- ----------------------------------------------------------------------------
-- This is NOT auto-applied by scripts/apply-migrations.mjs because it depends on
-- two things that only exist at deploy time:
--   • your deployed worker URL  (e.g. https://your-app.vercel.app)
--   • the WORKER_SECRET you set in the app's environment
--
-- Run it once in the Supabase SQL Editor, with the two placeholders replaced.
-- It schedules a once-a-minute POST to the worker, which enqueues due schedules
-- and drains the scan_jobs queue. The Node scan pipeline (puppeteer-core/Gemini)
-- stays in the app runtime; pg_cron only triggers it.
-- ============================================================================

-- 1. Enable the extensions (Supabase: also toggle-able under Database → Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Schedule the worker ping every minute. Replace the placeholders:
--    <WORKER_URL>     → https://your-app.vercel.app
--    <WORKER_SECRET>  → the same value set in the app env
--
-- (Unschedule first if re-running: select cron.unschedule('shadow-gtm-worker');)
select cron.schedule(
  'shadow-gtm-worker',
  '* * * * *',
  $$
  select net.http_post(
    url     := '<WORKER_URL>/api/worker/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', '<WORKER_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Inspect runs:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
