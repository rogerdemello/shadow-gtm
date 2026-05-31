import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import { computeMomentum } from "@/lib/trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-competitor momentum from the append-only signal history (the data moat).
// Optional ?companyId= narrows to one company; otherwise all watchlist companies.
export async function GET(req: Request) {
  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const companyId = new URL(req.url).searchParams.get("companyId");
  const companies = await store.listCompanies();
  const targets = companyId
    ? companies.filter((c) => c.id === companyId)
    : companies;

  const trends = await Promise.all(
    targets.map(async (c) => {
      const history = await store.listSignalHistory(c.id);
      return { company: { id: c.id, name: c.name }, momentum: computeMomentum(c.id, history) };
    }),
  );

  return NextResponse.json({ trends });
}
