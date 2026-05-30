import { NextResponse } from "next/server";
import { buildSeed } from "@/lib/seed";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drop a curated, demo-ready dataset into the calling org's workspace so first-
// time users see a fully populated dashboard. Idempotent — replaces the org's
// current state with the seed bundle.
export async function POST() {
  const r = await storeOr401();
  if (r.res) return r.res;
  const bundle = buildSeed();
  await r.store.loadSeedBundle(bundle);
  return NextResponse.json({
    ok: true,
    companies: bundle.companies.length,
    signals: bundle.signals.length,
  });
}
