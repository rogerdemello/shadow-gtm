import { NextResponse } from "next/server";
import type { PlanId } from "./types";

// ── Rate limiting ─────────────────────────────────────────────────────────────
// A lightweight in-memory fixed-window limiter. It protects the public API and
// expensive routes from a single caller's burst.
//
// Scope caveat: state lives in this process, so on a multi-instance/serverless
// deployment each instance enforces its own window (the effective limit is
// limit × instances). For a hard global cap, back this with Redis/Upstash and
// swap the `hit()` implementation — the call sites don't change. For
// single-instance / self-host it is exact.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the window resets. */
  resetMs: number;
}

/** Count one hit against `key` within a rolling fixed window. */
export function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    // Opportunistic GC so the map can't grow without bound.
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return {
    allowed: b.count <= limit,
    limit,
    remaining: Math.max(0, limit - b.count),
    resetMs: b.resetAt - now,
  };
}

/** Per-plan request-per-minute ceiling for the public API. null = unlimited. */
const PLAN_RPM: Record<PlanId, number | null> = {
  free: 60,
  startup: 300,
  growth: 1200,
  enterprise: null,
};

/** Enforce the public-API per-key limit for a plan. Returns a 429 response when
 *  exceeded (with Retry-After + RateLimit headers), else null. */
export function apiRateLimit(keyId: string, plan: PlanId): NextResponse | null {
  const limit = PLAN_RPM[plan];
  if (limit === null) return null; // enterprise: unmetered
  const r = hit(`api:${keyId}`, limit, 60_000);
  if (r.allowed) return null;
  const retrySec = Math.ceil(r.resetMs / 1000);
  return NextResponse.json(
    { error: "Rate limit exceeded. Slow down or upgrade your plan." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retrySec),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(retrySec),
      },
    },
  );
}

/** Generic per-org limiter for expensive in-app routes. Returns 429 or null. */
export function orgRateLimit(
  orgId: string,
  scope: string,
  limit: number,
  windowMs = 60_000,
): NextResponse | null {
  const r = hit(`${scope}:${orgId}`, limit, windowMs);
  if (r.allowed) return null;
  const retrySec = Math.ceil(r.resetMs / 1000);
  return NextResponse.json(
    { error: "Too many requests — try again shortly." },
    { status: 429, headers: { "Retry-After": String(retrySec) } },
  );
}
