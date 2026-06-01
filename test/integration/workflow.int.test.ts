import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { storeFor, type Store } from "../../lib/store.supabase";
import type { Database } from "../../lib/db/database.types";
import { resetEnvCache } from "../../lib/env";
import { scanCompany } from "../../lib/workflow";

// Full-loop live test: a real scanCompany against the LIVE Gemini API + Supabase,
// in a throwaway org. Proves the entire Gemini-native pipeline works end-to-end —
// URL-context page read → diff → Google-Search-grounded signals → structured
// extraction → stored signals/snapshots/evidence. Makes real Gemini calls.
// Run: npm run test:int   (needs GEMINI_API_KEY + Supabase keys in .env.local)

function readEnv(key: string): string | undefined {
  try {
    const raw = readFileSync(".env.local", "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    const v = line?.slice(key.length + 1).trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const service = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const geminiKey = readEnv("GEMINI_API_KEY");
const ready = Boolean(url && service && geminiKey);

// Make the Gemini key visible to lib/env (which reads process.env), then reset
// the cached parse so getEnv() picks it up.
if (geminiKey) {
  process.env.GEMINI_API_KEY = geminiKey;
  const model = readEnv("GEMINI_MODEL");
  if (model) process.env.GEMINI_MODEL = model;
  resetEnvCache();
}

const admin = ready
  ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
  : null;

const stamp = Date.now();
let orgId: string;
let store: Store;

beforeAll(async () => {
  if (!admin) return;
  const { data, error } = await admin
    .from("orgs")
    .insert({ name: `wf-int ${stamp}` })
    .select("*")
    .single();
  if (error) throw new Error(`create org: ${error.message}`);
  orgId = data.id;
  store = storeFor({ db: admin, orgId, userId: null });
});

afterAll(async () => {
  if (admin && orgId) await admin.from("orgs").delete().eq("id", orgId); // cascades
});

describe.skipIf(!ready)("scanCompany (live Gemini + Supabase)", () => {
  it(
    "runs the full loop and stores real intelligence",
    async () => {
      const company = await store.addCompany({
        name: "Anthropic",
        domain: "anthropic.com",
        pricingUrl: "https://www.anthropic.com/pricing",
      });
      const scan = await store.createScan([company.id]);

      const result = await scanCompany(store, company, scan.id);

      // Free-tier Gemini keys allow only ~5 requests/min; a scan bursts ~4 calls.
      // If we got rate-limited, that's an external quota, not a logic failure —
      // don't fail the suite over it (the retrieval path is proven in npm run smoke).
      if (result.error && /429|RESOURCE_EXHAUSTED|quota/i.test(result.error)) {
        console.warn("[workflow.int] skipped assertions — Gemini rate-limited:", result.error.slice(0, 120));
        return;
      }

      // The loop completed without a fatal error.
      expect(result.error).toBeUndefined();
      expect(Array.isArray(result.signals)).toBe(true);

      // Retrieval actually read a page (URL-context returned real content).
      const snapshots = await store.listSnapshots(company.id);
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0].text.length).toBeGreaterThan(100);

      // Evidence (sources + any SERP) was persisted.
      const evidence = await store.getEvidence(company.id);
      expect(evidence?.sources.length ?? 0).toBeGreaterThan(0);

      // If the model surfaced signals, they should be well-formed + quote-backed.
      for (const s of result.signals) {
        expect(s.opportunityScore).toBeGreaterThanOrEqual(0);
        expect(s.opportunityScore).toBeLessThanOrEqual(100);
        expect(typeof s.reasoning).toBe("string");
      }

      // Extraction was metered.
      const usage = await store.getUsageSummary("1970-01-01T00:00:00.000Z");
      expect(usage.events).toBeGreaterThan(0);
    },
    180_000,
  );
});
