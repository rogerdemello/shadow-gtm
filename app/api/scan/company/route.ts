import { NextResponse } from "next/server";
import { getCompany } from "@/lib/store";
import { scanCompany } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bright Data + Claude per company can take a while; give the handler room.
export const maxDuration = 120;

// Run the full intelligence pass for a single company. Returns its signals so
// the dashboard can append them to the live feed as each one completes.
export async function POST(req: Request) {
  let body: { scanId?: string; companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { scanId, companyId } = body;
  if (!scanId || !companyId) {
    return NextResponse.json(
      { error: "scanId and companyId are required" },
      { status: 400 },
    );
  }

  const company = await getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const result = await scanCompany(company, scanId);
  return NextResponse.json({ result });
}
