import { NextResponse } from "next/server";
import { DuplicateCompanyError } from "@/lib/store";
import { storeOr401 } from "@/lib/store-context";
import { planFor } from "@/lib/plans";
import { companyLimitReached } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await storeOr401();
  if (r.res) return r.res;
  return NextResponse.json({ companies: await r.store.listCompanies() });
}

export async function POST(req: Request) {
  let body: {
    name?: string;
    domain?: string;
    pricingUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const domain = body.domain?.trim();
  if (!name || !domain) {
    return NextResponse.json(
      { error: "name and domain are required" },
      { status: 400 },
    );
  }

  const r = await storeOr401();
  if (r.res) return r.res;

  // Enforce the plan's company cap.
  const [existing, sub] = await Promise.all([
    r.store.listCompanies(),
    r.store.getSubscription(),
  ]);
  const plan = planFor(sub.plan);
  if (companyLimitReached(plan, existing.length)) {
    return NextResponse.json(
      {
        error: `Your ${plan.name} plan allows up to ${plan.limits.maxCompanies} competitors. Upgrade in Settings → Billing.`,
      },
      { status: 402 },
    );
  }

  try {
    const company = await r.store.addCompany({
      name,
      domain,
      pricingUrl: body.pricingUrl,
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
