import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What fed the most recent scan for this company — sources, SERP results,
// change summary. Drives the "Evidence" panel so signals are auditable.
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  const evidence = await r.store.getEvidence(companyId);
  return NextResponse.json({ evidence: evidence ?? null });
}
