import { NextResponse } from "next/server";
import { getEnv, dossierSignalsEnabled } from "@/lib/env";
import { getServiceClient } from "@/lib/db/service";
import { storeFor } from "@/lib/store.supabase";
import { id as newId } from "@/lib/store";
import { scanCompany } from "@/lib/workflow";
import { runDossierStream, dossierToSignals } from "@/lib/dossier";
import { runTriage } from "@/lib/autonomy";
import {
  claimDueJobs,
  completeJob,
  enqueueDossierJob,
  enqueueDueFromSchedules,
  failJob,
  sendDueDigests,
} from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { verifyWorkerRequest } from "@/lib/worker-auth";
import { tokenBudgetStatus } from "@/lib/budget";

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
  // Read the raw body once (needed to verify a signed request) and reuse it.
  const rawBody = await req.text();
  if (!verifyWorkerRequest(req, rawBody, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();

  // 1. Turn due schedules into queued jobs.
  const enqueued = await enqueueDueFromSchedules(db);

  // 1b. Send any due weekly digests (no-op when email isn't configured).
  const digests = await sendDueDigests(db);

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

      // Autonomous deep-dive job (enqueued by the triage agent).
      if (job.kind === "dossier") {
        // Respect the org's monthly token budget for autonomous spend — skip
        // (don't retry) when exhausted rather than silently burning quota.
        const budget = await tokenBudgetStatus(store);
        if (budget.over) {
          log.warn("skipping autonomous dossier — token budget exhausted", {
            org: job.org_id,
            company: company.name,
          });
          await completeJob(db, job.id, null);
          done++;
          continue;
        }
        let md = "";
        let tokensIn = 0;
        let tokensOut = 0;
        for await (const ev of runDossierStream(company)) {
          if (ev.type === "done") {
            md = ev.markdown;
            tokensIn = ev.tokensIn;
            tokensOut = ev.tokensOut;
          } else if (ev.type === "error") throw new Error(ev.error);
        }
        if (md) {
          await store.saveDossier({
            id: newId(),
            companyId: company.id,
            companyName: company.name,
            markdown: md,
            createdAt: new Date().toISOString(),
          });
          await store.recordUsage({
            kind: "gemini_dossier",
            companyId: company.id,
            units: 1,
            tokensIn,
            tokensOut,
          });
          // Feed the autonomous dossier's findings back into the pipeline (opt-in).
          if (dossierSignalsEnabled()) {
            const sigs = await dossierToSignals(company, md).catch(() => []);
            if (sigs.length) await store.addSignals(sigs);
          }
        }
        await completeJob(db, job.id, null);
        done++;
        continue;
      }

      // Standard scan job.
      const scan = await store.createScan([company.id]);
      const result = await scanCompany(store, company, scan.id);
      if (result.error) {
        await failJob(db, job, result.error);
        failed++;
        continue;
      }
      await completeJob(db, job.id, scan.id);
      done++;

      // Proactive autonomy: triage the scan's high-opportunity signals.
      try {
        const rule = await store.getAlertRule();
        if (rule.autonomyLevel !== "none") {
          const alerts = result.signals.filter((s) => s.opportunityScore >= rule.minOpportunity);
          if (alerts.length > 0) {
            const verdict = await runTriage(company, alerts);
            if (verdict?.worthy) {
              await store.createNotifications([
                {
                  companyId: company.id,
                  companyName: company.name,
                  kind: "triage",
                  title: `Agent take · ${company.name}`,
                  body: verdict.recommendation,
                  opportunityScore: Math.max(...alerts.map((s) => s.opportunityScore)),
                },
              ]);
              if (verdict.deepDive && rule.autonomyLevel === "deep_dive") {
                await enqueueDossierJob(db, { orgId: job.org_id, companyId: company.id });
              }
            }
          }
        }
      } catch (e) {
        log.warn("autonomy triage failed", { company: company.name, error: (e as Error).message });
      }
    } catch (err) {
      await failJob(db, job, (err as Error).message);
      failed++;
    }
  }

  log.info("worker run", { enqueued, digests, claimed: jobs.length, done, failed });
  return NextResponse.json({ enqueued, digests, claimed: jobs.length, done, failed });
}
