import Stripe from "stripe";
import { env, billingConfigured } from "./env";
import type { PlanId } from "./types";

// ── Stripe billing ─────────────────────────────────────────────────────────
// All Stripe access funnels through here, behind billingConfigured(). Plan↔price
// mapping is env-driven so the catalog (lib/plans.ts) stays secret-free.

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY!);
  return _stripe;
}

export { billingConfigured };

/** Map a self-serve plan → its configured Stripe price id. */
export function priceIdForPlan(plan: PlanId): string | undefined {
  switch (plan) {
    case "startup":
      return env.STRIPE_PRICE_STARTUP;
    case "growth":
      return env.STRIPE_PRICE_GROWTH;
    default:
      return undefined;
  }
}

/** Reverse map a Stripe price id → our plan id (for webhook handling). */
export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_STARTUP) return "startup";
  if (priceId === env.STRIPE_PRICE_GROWTH) return "growth";
  return null;
}

/** Create a Checkout session for an org upgrading to a paid plan. */
export async function createCheckoutSession(opts: {
  orgId: string;
  plan: PlanId;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const price = priceIdForPlan(opts.plan);
  if (!price) throw new Error(`No Stripe price configured for plan "${opts.plan}"`);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: opts.orgId,
    customer_email: opts.customerEmail || undefined,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // Stamp the org on the subscription so later subscription.* webhooks resolve it.
    subscription_data: { metadata: { orgId: opts.orgId } },
    metadata: { orgId: opts.orgId },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Create a billing-portal session so a customer can manage/cancel. */
export async function createPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}

/** Verify + parse a Stripe webhook payload. Throws on bad signature. */
export function constructEvent(rawBody: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET!);
}
