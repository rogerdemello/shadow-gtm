import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/service";
import { storeFor } from "@/lib/store.supabase";
import { scanCompany } from "@/lib/workflow";
import {
  claimDueJobs,
  completeJob,
  enqueueDueFromSchedules,
  failJob,
} from "@/lib/jobs";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger.child({ module: "worker" });

// ── Background scan worker ────────────────────────────────────────────────────
// Drains the scan_jobs queue: enqueues anything due from schedules, then runs
// the existing scanCompany pipeline per job (service-role client scoped by the
// job's org_id — RLS is bypassed, so scoping is our responsibility). Invoked by
// pg_cron via pg_net (see supabase/cron-setup.sql), or manually for testing.
//
// Auth: a shared secret in the `x-worker-secret` header (or Bearer token). With
// no WORKER_SECRET configured the worker is disabled (503).
export async function POST(req: Request) {
  const secret = getEnv().WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Worker not configured" }, { status: 503 });
  }
  const provided =
    req.headers.get("x-worker-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();

  // 1. Turn due schedules into queued jobs.
  const enqueued = await enqueueDueFromSchedules(db);

  // 2. Claim and process due jobs.
  const jobs = await claimDueJobs(db, 10);
  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const store = storeFor({ db, orgId: job.org_id, userId: null });
      const company = await store.getCompany(job.company_id);
      if (!company) {
        await failJob(db, job, "company not found");
        failed++;
        continue;
      }
      const scan = await store.createScan([company.id]);
      const result = await scanCompany(store, company, scan.id);
      if (result.error) {
        await failJob(db, job, result.error);
        failed++;
      } else {
        await completeJob(db, job.id, scan.id);
        done++;
      }
    } catch (err) {
      await failJob(db, job, (err as Error).message);
      failed++;
    }
  }

  log.info("worker run", { enqueued, claimed: jobs.length, done, failed });
  return NextResponse.json({ enqueued, claimed: jobs.length, done, failed });
}
