import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregate metered usage for the active org over the last N days (default 30).
export async function GET(req: Request) {
  const r = await contextOrError();
  if (r.res) return r.res;

  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const summary = await r.ctx.store.getUsageSummary(since);
  return NextResponse.json({ summary, days });
}
