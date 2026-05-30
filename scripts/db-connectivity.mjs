// Confirms the anon + service_role API keys work through the Supabase JS client
// (REST/Auth), not just the direct Postgres path. Read-only.
//   node scripts/db-connectivity.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(path.join(root, ".env.local"), "utf8");
const get = (k) =>
  envText.split(/\r?\n/).find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = get("SUPABASE_SERVICE_ROLE_KEY");

console.log("URL:", url);
console.log("anon key:", anon ? `${anon.slice(0, 12)}… (${anon.length} chars)` : "MISSING");
console.log("service key:", service ? `${service.slice(0, 12)}… (${service.length} chars)` : "MISSING");

// service_role bypasses RLS → should read the (empty) orgs table fine.
const svc = createClient(url, service, { auth: { persistSession: false } });
const { error: svcErr, count } = await svc
  .from("orgs")
  .select("*", { count: "exact", head: true });
console.log("\nservice_role → orgs count:", svcErr ? `ERROR: ${svcErr.message}` : count);

// anon with no session → RLS should yield 0 rows (not an error).
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const { data: anonRows, error: anonErr } = await anonClient.from("orgs").select("*");
console.log(
  "anon (no session) → orgs:",
  anonErr ? `ERROR: ${anonErr.message}` : `${anonRows.length} rows (RLS-filtered)`,
);
