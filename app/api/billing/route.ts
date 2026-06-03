import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { billingConfigured } from "@/lib/env";
import { CHECKOUT_PLANS, PLANS, planFor } from "@/lib/plans";
import {
  SCAN_USAGE_KIND,
  scanQuotaStatus,
  startOfMonthIso,
  tokenQuotaStatus,
} from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Billing snapshot for the Settings → Billing tab: current plan, scan-quota
// status this month, company count, and the catalog for upgrade buttons.
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  const { store, role } = r.ctx;

  const [sub, usage, companies] = await Promise.all([
    store.getSubscription(),
    store.getUsageSummary(startOfMonthIso(new Date())),
    store.listCompanies(),
  ]);
  const plan = planFor(sub.plan);
  const quota = scanQuotaStatus(plan, usage.byKind[SCAN_USAGE_KIND] ?? 0);
  const tokenQuota = tokenQuotaStatus(plan, usage.tokensIn + usage.tokensOut);

  return NextResponse.json({
    subscription: sub,
    plan,
    quota,
    tokenQuota,
    companies: companies.length,
    plans: PLANS,
    checkoutPlans: CHECKOUT_PLANS,
    billingEnabled: billingConfigured(),
    role,
  });
}
