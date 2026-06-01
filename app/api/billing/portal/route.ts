import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { appUrl, billingConfigured } from "@/lib/env";
import { createPortalSession } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open the Stripe billing portal to manage/cancel (owner/admin only).
export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  const sub = await r.ctx.store.getSubscription();
  if (!sub.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account yet — upgrade to a paid plan first." },
      { status: 400 },
    );
  }

  try {
    const url = await createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${appUrl()}/settings`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
