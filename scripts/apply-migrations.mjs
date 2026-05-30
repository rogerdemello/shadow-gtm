// Apply supabase/migrations/*.sql in filename order over a direct Postgres
// connection. Ops/dev only — the app never connects to Postgres directly (it
// goes through the Supabase client + RLS). Idempotent-ish: re-running fails on
// `create type`/`create table` that already exist, so it's meant for a fresh DB
// (or run individual files via the SQL Editor after that).
//
//   SUPABASE_DB_URL=postgresql://... node scripts/apply-migrations.mjs
//
// Reads SUPABASE_DB_URL from the environment or .env.local.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader (no dependency on the app's server-only lib/env).
function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    const raw = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1];
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const connectionString = loadDbUrl();
if (!connectionString) {
  console.error("SUPABASE_DB_URL not set (env or .env.local). Aborting.");
  process.exit(1);
}

const migrationsDir = path.join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No .sql migrations found in supabase/migrations.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  // Supabase requires TLS; the cert chain isn't always present locally.
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Connected. Applying ${files.length} migration(s):\n`);
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`  • ${file} … `);
    await client.query(sql);
    console.log("ok");
  }
  console.log("\nAll migrations applied successfully.");
} catch (err) {
  console.error(`\nMigration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
