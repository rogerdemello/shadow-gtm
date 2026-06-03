import { NextResponse } from "next/server";
import type { Store } from "./store.supabase";
import { planFor } from "./plans";
import { tokenQuotaStatus, startOfMonthIso, type QuotaStatus } from "./quota";

// ── Monthly AI token budget ───────────────────────────────────────────────────
// Every AI operation (extraction, dossier, narrative, battlecard, agent) records
// real token usage. This module reads the month-to-date total and compares it to
// the org's plan budget so a single expensive op can't drain an account, and a
// free user can't run unlimited dossiers. Heavy routes preflight this and return
// 402 when the budget is exhausted.

/** Month-to-date token-budget status for an org (plan budget vs tokens used). */
export async function tokenBudgetStatus(store: Store): Promise<QuotaStatus> {
  const sub = await store.getSubscription();
  const plan = planFor(sub.plan);
  const usage = await store.getUsageSummary(startOfMonthIso(new Date()));
  return tokenQuotaStatus(plan, usage.tokensIn + usage.tokensOut);
}

/** Route guard: 402 response when the org is over its monthly token budget, else
 *  null. Call after auth, before kicking off an AI-heavy operation. */
export async function tokenBudgetOr402(store: Store): Promise<NextResponse | null> {
  const status = await tokenBudgetStatus(store);
  if (status.over) {
    return NextResponse.json(
      {
        error:
          "Monthly AI token budget exhausted for this plan. Upgrade to keep generating, or wait for next month's reset.",
        budget: status,
      },
      { status: 402 },
    );
  }
  return null;
}
