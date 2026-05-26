import { NextResponse } from "next/server";
import { createScan, listCompanies } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a scan: creates a scan record over the chosen companies (default all)
// and returns the order the client should process them in. The client then
// hits /api/scan/company per company so the live feed updates incrementally.
export async function POST(req: Request) {
  let body: { companyIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — scan everything
  }

  const companies = await listCompanies();
  const ids =
    body.companyIds && body.companyIds.length
      ? companies.filter((c) => body.companyIds!.includes(c.id)).map((c) => c.id)
      : companies.map((c) => c.id);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Add at least one competitor before scanning." },
      { status: 400 },
    );
  }

  const scan = await createScan(ids);
  const queue = companies
    .filter((c) => ids.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return NextResponse.json({ scanId: scan.id, queue });
}
