// Quick read-only sanity check of the live schema. Confirms the expected tables
// exist with RLS enabled and the helper functions are present.
//   node scripts/db-check.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const raw = readFileSync(path.join(root, ".env.local"), "utf8");
  return raw.split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="))?.slice("SUPABASE_DB_URL=".length).trim();
}

const client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

const tables = await client.query(`
  select c.relname as table, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
`);
console.log("Tables (public) + RLS:");
for (const r of tables.rows) console.log(`  ${r.rls ? "🔒" : "⚠️ "} ${r.table}`);

const fns = await client.query(`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_org_member','has_org_role','create_org_with_owner','set_signals_not_current','handle_new_user')
  order by p.proname;
`);
console.log("\nFunctions:", fns.rows.map((r) => r.proname).join(", ") || "(none)");

const policies = await client.query(
  `select count(*)::int as n from pg_policies where schemaname = 'public';`,
);
console.log("RLS policies (public):", policies.rows[0].n);

await client.end();
