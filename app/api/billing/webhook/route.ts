import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { billingConfigured, env } from "@/lib/env";
import { constructEvent, planForPrice, stripe } from "@/lib/billing";
import { getServiceClient } from "@/lib/db/service";
import { storeFor } from "@/lib/store.supabase";
import { logger } from "@/lib/logger";
import type { PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "stripe-webhook" });

// Stripe webhook → keep the subscriptions table in sync. Signature-verified,
// no session auth (Stripe calls it); writes via the service client (RLS bypass).
export async function POST(req: Request) {
  if (!billingConfigured() || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = constructEvent(raw, sig);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = s.client_reference_id || s.metadata?.orgId || null;
        if (orgId && s.subscription) {
          const sub = await stripe().subscriptions.retrieve(s.subscription as string);
          await applySubscription(orgId, sub, s.customer as string | null);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.orgId as string | undefined) ?? null;
        if (orgId) await applySubscription(orgId, sub, sub.customer as string | null);
        break;
      }
    }
  } catch (err) {
    log.error("webhook handler failed", err as Error, { type: event.type });
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function applySubscription(
  orgId: string,
  sub: Stripe.Subscription,
  customerId: string | null,
): Promise<void> {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan: PlanId = sub.status === "canceled" ? "free" : planForPrice(priceId) ?? "free";
  // current_period_end placement varies by API version; read defensively.
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  const store = storeFor({ db: getServiceClient(), orgId, userId: null });
  await store.upsertSubscription({
    plan,
    status: sub.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });
  log.info("subscription synced", { orgId, plan, status: sub.status });
}
