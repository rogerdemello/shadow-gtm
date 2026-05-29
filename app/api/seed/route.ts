import { NextResponse } from "next/server";
import { loadSeedBundle } from "@/lib/store";
import { buildSeed } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drop a curated, demo-ready dataset into the store so judges and first-time
// users see a fully populated dashboard without needing to configure any keys.
// Idempotent — replaces the current state with the seed bundle.
export async function POST() {
  const bundle = buildSeed();
  await loadSeedBundle(bundle);
  return NextResponse.json({
    ok: true,
    companies: bundle.companies.length,
    signals: bundle.signals.length,
  });
}
