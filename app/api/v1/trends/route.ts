import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/apikey";
import { computeMomentum, computeSeries } from "@/lib/trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public API — per-competitor momentum + time series from signal history.
export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if ("error" in auth) return auth.error;

  const companies = await auth.store.listCompanies();
  const data = await Promise.all(
    companies.map(async (c) => {
      const history = await auth.store.listSignalHistory(c.id);
      return {
        company: { id: c.id, name: c.name },
        momentum: computeMomentum(c.id, history),
        series: computeSeries(c.id, history),
      };
    }),
  );
  return NextResponse.json({ data });
}
