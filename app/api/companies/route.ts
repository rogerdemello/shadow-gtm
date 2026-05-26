import { NextResponse } from "next/server";
import { addCompany, listCompanies } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ companies: await listCompanies() });
}

export async function POST(req: Request) {
  let body: { name?: string; domain?: string; pricingUrl?: string };
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

  const company = await addCompany({ name, domain, pricingUrl: body.pricingUrl });
  return NextResponse.json({ company }, { status: 201 });
}
