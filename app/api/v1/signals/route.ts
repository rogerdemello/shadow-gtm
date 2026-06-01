import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/apikey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public API — current signals for the org, newest first. Optional ?companyId=.
export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if ("error" in auth) return auth.error;

  const companyId = new URL(req.url).searchParams.get("companyId");
  let signals = await auth.store.listSignals();
  if (companyId) signals = signals.filter((s) => s.companyId === companyId);
  return NextResponse.json({ data: signals });
}
