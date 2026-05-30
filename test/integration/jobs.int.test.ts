import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/db/database.types";
import {
  enqueueScanJob,
  claimDueJobs,
  completeJob,
  failJob,
  enqueueDueFromSchedules,
} from "../../lib/jobs";

// Live test of the scan-job queue mechanics (lib/jobs) against the real DB,
// using a throwaway org. Does NOT run a full scan (no Gemini/Bright Data) — it
// verifies enqueue / claim / complete / fail / schedule-materialization.

function env(key: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const v = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim();
  if (!v) throw new Error(`${key} missing`);
  return v;
}

const db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const stamp = Date.now();
let orgId: string;
let companyId: string;

beforeAll(async () => {
  const { data: org } = await db.from("orgs").insert({ name: `jobs-test ${stamp}` }).select("*").single();
  orgId = org!.id;
  const { data: c } = await db
    .from("companies")
    .insert({ org_id: orgId, name: "Acme", domain: `jobs-${stamp}.com`, pricing_url: "https://x/pricing" })
    .select("*")
    .single();
  companyId = c!.id;
});

afterAll(async () => {
  if (orgId) await db.from("orgs").delete().eq("id", orgId);
});

describe("queue lifecycle", () => {
  it("enqueue → claim (running) → complete (done)", async () => {
    const jobId = await enqueueScanJob(db, { orgId, companyId });
    expect(jobId).toBeTruthy();

    const claimed = await claimDueJobs(db, 10);
    const mine = claimed.find((j) => j.id === jobId);
    expect(mine?.status).toBe("running");

    await completeJob(db, jobId!, null);
    const { data } = await db.from("scan_jobs").select("status").eq("id", jobId!).single();
    expect(data?.status).toBe("done");
  });

  it("failJob retries (pending + future run_at) until max_attempts then fails", async () => {
    const jobId = await enqueueScanJob(db, { orgId, companyId });
    const [job] = (await claimDueJobs(db, 10)).filter((j) => j.id === jobId);

    await failJob(db, job, "boom");
    let { data } = await db.from("scan_jobs").select("*").eq("id", jobId!).single();
    expect(data?.status).toBe("pending");
    expect(data?.attempts).toBe(1);
    expect(new Date(data!.run_at).getTime()).toBeGreaterThan(Date.now()); // backoff

    // Exhaust remaining attempts (max_attempts default 3).
    await failJob(db, { ...job, attempts: 1 }, "boom");
    await failJob(db, { ...job, attempts: 2 }, "boom");
    ({ data } = await db.from("scan_jobs").select("*").eq("id", jobId!).single());
    expect(data?.status).toBe("failed");
    expect(data?.attempts).toBe(3);
  });
});

describe("enqueueDueFromSchedules", () => {
  it("materializes a due schedule into a job and advances next_run_at", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { data: sched } = await db
      .from("schedules")
      .insert({ org_id: orgId, company_id: companyId, cadence: "daily", next_run_at: past })
      .select("*")
      .single();

    const before = await db.from("scan_jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    const enqueued = await enqueueDueFromSchedules(db);
    expect(enqueued).toBeGreaterThanOrEqual(1);

    const after = await db.from("scan_jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    expect((after.count ?? 0)).toBeGreaterThan(before.count ?? 0);

    const { data: updated } = await db.from("schedules").select("next_run_at,last_run_at").eq("id", sched!.id).single();
    expect(new Date(updated!.next_run_at).getTime()).toBeGreaterThan(Date.now()); // advanced ~1 day
    expect(updated!.last_run_at).not.toBeNull();
  });
});
