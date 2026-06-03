import type { Plan, PlanId } from "./types";

// ── Plan catalog ─────────────────────────────────────────────────────────────
// Single source of truth for tiers + quotas. Pricing page, billing UI, and
// quota enforcement all read from here so they never drift. Stripe price IDs
// are env-driven (lib/billing.ts) — this file stays free of secrets.

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    blurb: "Kick the tires on a handful of competitors.",
    limits: { monthlyScans: 20, maxCompanies: 3, maxMembers: 1, monthlyTokens: 2_000_000 },
  },
  startup: {
    id: "startup",
    name: "Startup",
    priceMonthly: 99,
    blurb: "For a founding GTM team tracking the core competitive set.",
    limits: { monthlyScans: 500, maxCompanies: 15, maxMembers: 5, monthlyTokens: 50_000_000 },
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 499,
    blurb: "Scale monitoring across the full market with the whole team.",
    limits: { monthlyScans: 5000, maxCompanies: 75, maxMembers: 25, monthlyTokens: 500_000_000 },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: -1, // custom / contact sales
    blurb: "Unlimited coverage, SSO, and a data-residency story.",
    limits: { monthlyScans: null, maxCompanies: null, maxMembers: null, monthlyTokens: null },
  },
};

/** Ordered low→high for upgrade UIs. */
export const PLAN_ORDER: PlanId[] = ["free", "startup", "growth", "enterprise"];

/** Resolve a plan by id, defaulting to free for unknown/absent values. */
export function planFor(id?: string | null): Plan {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}

/** Plans a user can self-serve checkout into (enterprise is contact-sales). */
export const CHECKOUT_PLANS: PlanId[] = ["startup", "growth"];
