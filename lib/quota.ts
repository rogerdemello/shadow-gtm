import type { Plan } from "./types";

// ── Quota math ───────────────────────────────────────────────────────────────
// Pure functions over a plan + observed usage. No DB/IO — fully unit-testable.
// `null` limit means unlimited.

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export interface QuotaStatus {
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null; // null = unlimited
  over: boolean;
}

/** Status of an org's monthly scan usage against its plan. */
export function scanQuotaStatus(plan: Plan, scansThisMonth: number): QuotaStatus {
  const limit = plan.limits.monthlyScans;
  if (limit === null) {
    return { used: scansThisMonth, limit: null, remaining: null, over: false };
  }
  return {
    used: scansThisMonth,
    limit,
    remaining: Math.max(0, limit - scansThisMonth),
    over: scansThisMonth >= limit,
  };
}

/** True when adding one more company would exceed the plan's company cap. */
export function companyLimitReached(plan: Plan, currentCompanies: number): boolean {
  const max = plan.limits.maxCompanies;
  return max !== null && currentCompanies >= max;
}

/** True when adding one more member/invite would exceed the plan's seat cap. */
export function memberLimitReached(plan: Plan, currentSeats: number): boolean {
  const max = plan.limits.maxMembers;
  return max !== null && currentSeats >= max;
}

/** ISO timestamp for the start of the current UTC month — the scan-quota window. */
export function startOfMonthIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** The usage_events kind that counts as a billable "scan". */
export const SCAN_USAGE_KIND = "gemini_extraction";
