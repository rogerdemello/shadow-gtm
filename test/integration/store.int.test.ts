import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { storeFor, type Store } from "../../lib/store.supabase";
import type { Database } from "../../lib/db/database.types";

// Exercises the REAL Supabase-backed store (lib/store.supabase) against the LIVE
// project, in a throwaway org, to prove the store rewrite behaves like the JSON
// store did. Uses the service-role client (RLS bypass) scoped manually by org —
// RLS isolation itself is proven separately in scripts/test-rls.mjs.

function env(key: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  const v = line?.slice(key.length + 1).trim();
  if (!v) throw new Error(`${key} missing from .env.local`);
  return v;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const service = env("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient<Database>(url, service, { auth: { persistSession: false } });

const stamp = Date.now();
let orgId: string;
let companyId: string;
let store: Store;

beforeAll(async () => {
  const { data, error } = await admin
    .from("orgs")
    .insert({ name: `int-test ${stamp}` })
    .select("*")
    .single();
  if (error) throw new Error(`create org: ${error.message}`);
  orgId = data.id;
  store = storeFor({ db: admin, orgId, userId: null });
});

afterAll(async () => {
  if (orgId) await admin.from("orgs").delete().eq("id", orgId); // cascades
});

describe("companies", () => {
  it("adds and lists a company", async () => {
    const c = await store.addCompany({ name: "Acme", domain: "acme-" + stamp + ".com" });
    companyId = c.id;
    expect(c.domain).toBe(`acme-${stamp}.com`);
    const list = await store.listCompanies();
    expect(list.map((x) => x.id)).toContain(companyId);
  });

  it("rejects a duplicate domain", async () => {
    await expect(
      store.addCompany({ name: "Dup", domain: "acme-" + stamp + ".com" }),
    ).rejects.toThrow(/already on the watchlist/i);
  });
});

describe("snapshots", () => {
  it("saves and reads back the latest snapshot", async () => {
    await store.saveSnapshot({
      id: crypto.randomUUID(),
      companyId,
      pageType: "pricing",
      url: "https://acme.com/pricing",
      text: "Starter $49",
      hash: "hash-1",
      fetchedAt: new Date().toISOString(),
    });
    const latest = await store.latestSnapshot(companyId, "pricing");
    expect(latest?.hash).toBe("hash-1");
  });
});

describe("signals (append-only history)", () => {
  let scanId = "";

  const mkSignal = (desc: string) => ({
    id: crypto.randomUUID(),
    companyId,
    companyName: "Acme",
    scanId,
    type: "pricing" as const,
    description: desc,
    impact: "high" as const,
    confidence: 0.9,
    opportunityScore: 80,
    reasoning: "why",
    recommendedAction: "do",
    sourceUrl: "https://acme.com/pricing",
    quote: "Starter $49",
    createdAt: new Date().toISOString(),
  });

  it("replaceCompanySignals keeps only the latest set current", async () => {
    // signals.scan_id is a FK → scans; the real workflow always has a scan row.
    const scan = await store.createScan([companyId]);
    scanId = scan.id;
    await store.replaceCompanySignals(companyId, [mkSignal("first")]);
    await store.replaceCompanySignals(companyId, [mkSignal("second-a"), mkSignal("second-b")]);
    const current = (await store.listSignals()).filter((s) => s.companyId === companyId);
    expect(current).toHaveLength(2);
    expect(current.map((s) => s.description).sort()).toEqual(["second-a", "second-b"]);

    // History is retained (3 rows total: 1 old + 2 new), only 2 are current.
    const { count } = await admin
      .from("signals")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);
    expect(count).toBe(3);
  });
});

describe("usage metering", () => {
  it("records a usage event", async () => {
    await store.recordUsage({
      kind: "gemini_extraction",
      tokensIn: 1200,
      tokensOut: 350,
      companyId,
    });
    const { data } = await admin
      .from("usage_events")
      .select("*")
      .eq("org_id", orgId)
      .eq("kind", "gemini_extraction");
    expect(data?.length).toBe(1);
    expect(data?.[0].tokens_in).toBe(1200);
    expect(data?.[0].tokens_out).toBe(350);
  });
});

describe("history queries (data moat)", () => {
  it("listSignalHistory returns the full append-only history", async () => {
    // The signals block above created 1 old + 2 current = 3 rows.
    const history = await store.listSignalHistory(companyId);
    expect(history.length).toBe(3);
    // Oldest-first ordering.
    expect(history[0].createdAt <= history[history.length - 1].createdAt).toBe(true);
  });

  it("listSnapshots returns retained snapshots for the company", async () => {
    const snaps = await store.listSnapshots(companyId);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    expect(snaps[0].url).toContain("acme.com/pricing");
  });
});

describe("alerting", () => {
  it("defaults the alert threshold to 70 when no rule exists", async () => {
    expect(await store.getAlertThreshold()).toBe(70);
  });

  it("creates, lists, and marks notifications read", async () => {
    await store.createNotifications([
      { companyId, companyName: "Acme", title: "Acme: price hike", opportunityScore: 88 },
      { companyId, companyName: "Acme", title: "Acme: layoffs", opportunityScore: 75 },
    ]);
    const list = await store.listNotifications();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((n) => n.readAt === null)).toBe(true);

    await store.markNotificationsRead(list.map((n) => n.id));
    const after = await store.listNotifications();
    expect(after.every((n) => n.readAt !== null)).toBe(true);
  });
});

describe("battlecards", () => {
  it("upserts (one current card per company)", async () => {
    await store.saveBattlecard({
      id: crypto.randomUUID(),
      companyId,
      companyName: "Acme",
      markdown: "# v1",
      createdAt: new Date().toISOString(),
    });
    await store.saveBattlecard({
      id: crypto.randomUUID(),
      companyId,
      companyName: "Acme",
      markdown: "# v2",
      createdAt: new Date().toISOString(),
    });
    const card = await store.getBattlecard(companyId);
    expect(card?.markdown).toBe("# v2");
  });
});
