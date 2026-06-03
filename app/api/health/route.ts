import { NextResponse } from "next/server";
import { billingConfigured, geminiConfigured, getEnv, supabaseConfigured } from "@/lib/env";
import { getServiceClient } from "@/lib/db/service";
import { activeRegion } from "@/lib/region";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How stale the worker's last activity can be before we flag the cron as down.
const CRON_STALE_MS = 15 * 60 * 1000; // 15 min (cron runs every minute)

// Public health/heartbeat for uptime monitors. Reports provider configuration,
// a DB ping + queue depth, cron liveness, and request latency. Cached briefly so
// aggressive monitors don't hammer the DB.
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, unknown> = {
    gemini: geminiConfigured(),
    supabase: supabaseConfigured(),
    stripe: billingConfigured(),
    sentry: Boolean(process.env.SENTRY_DSN),
    region: activeRegion(),
  };
  let ok = true;

  if (supabaseConfigured() && getEnv().SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const db = getServiceClient();
      const { error, count } = await db
        .from("scan_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) {
        checks.db = "error";
        ok = false;
      } else {
        checks.db = "ok";
        checks.pendingJobs = count ?? 0;
      }

      // Cron liveness: newest worker activity (a claimed/finished job). Only
      // flagged stale when there is also pending work the worker should be doing.
      const { data: lastJob } = await db
        .from("scan_jobs")
        .select("started_at, finished_at")
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastActivity = lastJob?.finished_at ?? lastJob?.started_at ?? null;
      checks.lastWorkerActivity = lastActivity;
      if (lastActivity) {
        const stale = Date.now() - new Date(lastActivity).getTime() > CRON_STALE_MS;
        const pending = (checks.pendingJobs as number) > 0;
        checks.cron = stale && pending ? "stale" : "ok";
        if (stale && pending) ok = false;
      } else {
        checks.cron = "idle"; // never run yet — not an error
      }
    } catch {
      checks.db = "error";
      ok = false;
    }
  }

  checks.responseTimeMs = Date.now() - startedAt;

  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" },
    },
  );
}
