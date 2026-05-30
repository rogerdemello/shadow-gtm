// Live multi-tenant isolation test. Creates two confirmed users, each with their
// own org + a company, then asserts via the RLS-scoped (anon) client that
// neither org can see the other's data. Cleans up after itself.
//
//   node scripts/test-rls.mjs
//
// Exercises the real path the app uses: create_org_with_owner RPC under a user
// session, inserts under RLS, and cross-tenant read attempts.
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

const admin = createClient(url, service, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};

const stamp = Date.now();
const created = []; // { userId, orgId, email }

async function makeTenant(label) {
  const email = `rls-test-${label}-${stamp}@example.com`;
  const password = `Test!${stamp}${label}`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser(${label}): ${uErr.message}`);

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${label}): ${sErr.message}`);

  const { data: org, error: oErr } = await client.rpc("create_org_with_owner", {
    org_name: `${label} Corp ${stamp}`,
  });
  if (oErr) throw new Error(`create_org(${label}): ${oErr.message}`);

  const { data: company, error: cErr } = await client
    .from("companies")
    .insert({
      org_id: org.id,
      name: `${label}-competitor`,
      domain: `${label}-${stamp}.example.com`,
      pricing_url: `https://${label}.example.com/pricing`,
    })
    .select("*")
    .single();
  if (cErr) throw new Error(`insert company(${label}): ${cErr.message}`);

  created.push({ userId: u.user.id, orgId: org.id, email });
  return { client, org, company };
}

async function cleanup() {
  for (const t of created) {
    await admin.from("companies").delete().eq("org_id", t.orgId);
    await admin.from("orgs").delete().eq("id", t.orgId);
    await admin.auth.admin.deleteUser(t.userId);
  }
}

try {
  console.log("Two-org RLS isolation test\n");
  const A = await makeTenant("alpha");
  const B = await makeTenant("beta");

  // Each tenant sees exactly its own company.
  const aList = await A.client.from("companies").select("*");
  ok(aList.data?.length === 1 && aList.data[0].org_id === A.org.id,
     "tenant A sees only its own company");

  const bList = await B.client.from("companies").select("*");
  ok(bList.data?.length === 1 && bList.data[0].org_id === B.org.id,
     "tenant B sees only its own company");

  // Cross-tenant read by explicit org_id returns nothing (RLS, not error).
  const cross = await A.client.from("companies").select("*").eq("org_id", B.org.id);
  ok((cross.data?.length ?? 0) === 0, "tenant A cannot read tenant B's companies by org_id");

  // Cross-tenant org visibility.
  const crossOrg = await A.client.from("orgs").select("*").eq("id", B.org.id);
  ok((crossOrg.data?.length ?? 0) === 0, "tenant A cannot see tenant B's org row");

  // Cross-tenant write is rejected by the RLS check constraint.
  const crossWrite = await A.client.from("companies").insert({
    org_id: B.org.id,
    name: "intruder",
    domain: `intruder-${stamp}.example.com`,
    pricing_url: "https://intruder.example.com/pricing",
  });
  ok(crossWrite.error !== null, "tenant A cannot insert into tenant B's org (RLS write check)");

  // service_role sees everything (used by the worker).
  const allOrgs = await admin.from("orgs").select("*").in("id", [A.org.id, B.org.id]);
  ok((allOrgs.data?.length ?? 0) === 2, "service_role sees both orgs (RLS bypass)");
} catch (err) {
  fail++;
  console.error(`\nERROR: ${err.message}`);
} finally {
  await cleanup();
  console.log(`\nCleaned up ${created.length} test tenant(s).`);
  console.log(`\nResult: ${pass} passed, ${fail} failed.`);
  process.exitCode = fail === 0 ? 0 : 1;
}
