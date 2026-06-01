import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { appUrl, billingConfigured } from "@/lib/env";
import { CHECKOUT_PLANS } from "@/lib/plans";
import { createCheckoutSession } from "@/lib/billing";
import type { PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a Stripe Checkout for an upgrade (owner/admin only).
export async function POST(req: Request) {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  let body: { plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const plan = body.plan as PlanId;
  if (!CHECKOUT_PLANS.includes(plan)) {
    return NextResponse.json(
      { error: `plan must be one of ${CHECKOUT_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  try {
    const url = await createCheckoutSession({
      orgId: r.ctx.orgId,
      plan,
      customerEmail: r.ctx.email,
      successUrl: `${appUrl()}/settings?billing=success`,
      cancelUrl: `${appUrl()}/settings?billing=cancelled`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
