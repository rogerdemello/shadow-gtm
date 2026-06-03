// Schedule (or refresh) the pg_cron worker trigger over a direct Postgres
// connection — so WORKER_SECRET / WORKER_URL come from the environment at run
// time and never live in committed SQL. Ops/dev only.
//
//   SUPABASE_DB_URL=postgresql://... WORKER_URL=https://app.example.com \
//   WORKER_SECRET=... node scripts/setup-cron.mjs
//
// Reads all three from the environment or .env.local. The scheduled job posts a
// SIGNED request every minute (HMAC-SHA256 of `${ts}.{}` keyed by WORKER_SECRET),
// which the worker verifies with a 5-minute replay window (lib/worker-auth.ts).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fromEnvOrFile(name) {
  if (process.env[name]) return process.env[name];
  try {
    const raw = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`));
      if (m) return m[1];
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const connectionString = fromEnvOrFile("SUPABASE_DB_URL");
const workerUrl = (fromEnvOrFile("WORKER_URL") || fromEnvOrFile("APP_URL") || "").replace(/\/+$/, "");
const workerSecret = fromEnvOrFile("WORKER_SECRET");

const missing = [];
if (!connectionString) missing.push("SUPABASE_DB_URL");
if (!workerUrl) missing.push("WORKER_URL (or APP_URL)");
if (!workerSecret) missing.push("WORKER_SECRET");
if (missing.length) {
  console.error(`Missing required config: ${missing.join(", ")}. Aborting.`);
  process.exit(1);
}
if (workerSecret.length < 24) {
  console.error("WORKER_SECRET must be at least 24 characters. Aborting.");
  process.exit(1);
}

const endpoint = `${workerUrl}/api/worker/process`;

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  await client.query(`create extension if not exists pg_cron;`);
  await client.query(`create extension if not exists pg_net;`);
  await client.query(`create extension if not exists pgcrypto;`);

  // Replace any prior schedule so re-running is idempotent.
  await client.query(
    `select cron.unschedule('shadow-gtm-worker')
       where exists (select 1 from cron.job where jobname = 'shadow-gtm-worker');`,
  );

  // The cron command is built server-side with format(%L) so the endpoint and
  // secret are safely quoted (bound params $1/$2 — no string interpolation).
  // pgcrypto's hmac() signs `${ts}.{}`; now() is stable within the statement so
  // the header timestamp and the signed timestamp match (lib/worker-auth.ts).
  await client.query(
    `select cron.schedule(
       'shadow-gtm-worker',
       '* * * * *',
       format(
         $job$select net.http_post(
           url := %L,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-worker-timestamp', extract(epoch from now())::bigint::text,
             'x-worker-signature', encode(hmac(extract(epoch from now())::bigint::text || '.{}', %L, 'sha256'), 'hex')
           ),
           body := '{}'::jsonb
         );$job$,
         $1::text, $2::text
       )
     );`,
    [endpoint, workerSecret],
  );

  console.log(`Scheduled 'shadow-gtm-worker' -> ${endpoint} (every minute, signed).`);
  console.log(
    "Inspect: select * from cron.job;  /  select * from cron.job_run_details order by start_time desc limit 20;",
  );
} catch (err) {
  console.error(`\nCron setup failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
