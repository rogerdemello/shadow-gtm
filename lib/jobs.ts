import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, JobStatusEnum, ScheduleCadenceEnum } from "./db/database.types";
import { logger } from "./logger";

// ── Background scan queue ─────────────────────────────────────────────────────
// Cross-org queue operations for the worker, run through the service-role client
// (RLS bypass). Every function is explicitly org-scoped where it matters. The
// worker (app/api/worker/process) drains the queue; pg_cron enqueues due work
// from schedules and pings the worker (see supabase/cron-setup.sql).

const log = logger.child({ module: "jobs" });

type Db = SupabaseClient<Database>;
type JobRow = Database["public"]["Tables"]["scan_jobs"]["Row"];

const CADENCE_MS: Record<ScheduleCadenceEnum, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Queue a scan for one company. `runAtIso` defaults to now (immediate). */
export async function enqueueScanJob(
  db: Db,
  input: { orgId: string; companyId: string; runAtIso?: string },
): Promise<string | null> {
  const { data, error } = await db
    .from("scan_jobs")
    .insert({
      org_id: input.orgId,
      company_id: input.companyId,
      run_at: input.runAtIso ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    log.error("enqueueScanJob failed", error, { orgId: input.orgId });
    return null;
  }
  return data.id;
}

/** Claim up to `limit` due pending jobs, marking them running. Single-worker
 *  safe; multi-worker has a small race window (acceptable — jobs are idempotent
 *  enough and retried). */
export async function claimDueJobs(db: Db, limit = 10): Promise<JobRow[]> {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await db
    .from("scan_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);
  if (error) {
    log.error("claimDueJobs select failed", error);
    return [];
  }
  if (!due || due.length === 0) return [];

  const ids = due.map((j) => j.id);
  const { error: claimErr } = await db
    .from("scan_jobs")
    .update({ status: "running" as JobStatusEnum, started_at: nowIso })
    .in("id", ids);
  if (claimErr) {
    log.error("claimDueJobs claim failed", claimErr);
    return [];
  }
  // Reflect the claim on the returned rows (the SELECT above predates the update).
  return due.map((j) => ({ ...j, status: "running" as JobStatusEnum, started_at: nowIso }));
}

export async function completeJob(
  db: Db,
  jobId: string,
  scanId: string | null,
): Promise<void> {
  const { error } = await db
    .from("scan_jobs")
    .update({
      status: "done" as JobStatusEnum,
      scan_id: scanId,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) log.error("completeJob failed", error, { jobId });
}

/** Record a failure. Retries with backoff until max_attempts, then marks failed. */
export async function failJob(db: Db, job: JobRow, errMsg: string): Promise<void> {
  const attempts = job.attempts + 1;
  const exhausted = attempts >= job.max_attempts;
  const backoffMs = Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000); // cap 1h
  const { error } = await db
    .from("scan_jobs")
    .update({
      status: (exhausted ? "failed" : "pending") as JobStatusEnum,
      attempts,
      error: errMsg.slice(0, 500),
      run_at: exhausted
        ? job.run_at
        : new Date(Date.now() + backoffMs).toISOString(),
      finished_at: exhausted ? new Date().toISOString() : null,
      started_at: null,
    })
    .eq("id", job.id);
  if (error) log.error("failJob failed", error, { jobId: job.id });
}

/** Materialize due schedules into scan_jobs, then advance each schedule's
 *  next_run_at by its cadence. Returns the number of jobs enqueued. */
export async function enqueueDueFromSchedules(db: Db): Promise<number> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: due, error } = await db
    .from("schedules")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", nowIso);
  if (error) {
    log.error("enqueueDueFromSchedules select failed", error);
    return 0;
  }
  if (!due || due.length === 0) return 0;

  let enqueued = 0;
  for (const sched of due) {
    // Resolve target companies: a specific one, or all in the org.
    let companyIds: string[] = [];
    if (sched.company_id) {
      companyIds = [sched.company_id];
    } else {
      const { data: companies } = await db
        .from("companies")
        .select("id")
        .eq("org_id", sched.org_id);
      companyIds = (companies ?? []).map((c) => c.id);
    }

    for (const companyId of companyIds) {
      const id = await enqueueScanJob(db, { orgId: sched.org_id, companyId });
      if (id) enqueued++;
    }

    // Advance the schedule.
    const nextRun = new Date(now + CADENCE_MS[sched.cadence]).toISOString();
    await db
      .from("schedules")
      .update({ last_run_at: nowIso, next_run_at: nextRun })
      .eq("id", sched.id);
  }
  log.info("enqueueDueFromSchedules", { schedules: due.length, enqueued });
  return enqueued;
}
