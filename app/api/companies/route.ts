import { NextResponse } from "next/server";
import { DuplicateCompanyError } from "@/lib/store";
import { storeOr401 } from "@/lib/store-context";

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
    renderJs?: boolean;
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

  try {
    const company = await r.store.addCompany({
      name,
      domain,
      pricingUrl: body.pricingUrl,
      renderJs: body.renderJs,
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
