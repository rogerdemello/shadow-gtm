import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Immutable audit trail for a competitor: every page we fetched (url + content
// hash + timestamp) and the evidence that fed the latest scan. This is the
// enterprise "prove where every claim came from" surface.
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const [snapshots, evidence] = await Promise.all([
    store.listSnapshots(companyId),
    store.getEvidence(companyId),
  ]);

  return NextResponse.json({
    // Don't ship the full page text — just the verifiable fingerprint.
    snapshots: snapshots.map((s) => ({
      pageType: s.pageType,
      url: s.url,
      hash: s.hash,
      fetchedAt: s.fetchedAt,
    })),
    evidence: evidence ?? null,
  });
}
