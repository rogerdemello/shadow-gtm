import { NextResponse } from "next/server";
import {
  brightDataConfigured,
  geminiConfigured,
  getEnv,
  supabaseConfigured,
} from "@/lib/env";
import { getServiceClient } from "@/lib/db/service";
import { activeRegion } from "@/lib/region";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public health/heartbeat for uptime monitors. Reports provider configuration
// and, when the service role is available, a DB ping + pending-queue depth.
export async function GET() {
  const checks: Record<string, unknown> = {
    gemini: geminiConfigured(),
    brightData: brightDataConfigured(),
    supabase: supabaseConfigured(),
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
    } catch {
      checks.db = "error";
      ok = false;
    }
  }

  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
