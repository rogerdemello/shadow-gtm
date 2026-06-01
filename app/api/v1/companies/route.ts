import { NextResponse } from "next/server";
import { apiKeyAuth } from "@/lib/apikey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public API — list the authenticated org's watchlist. Auth: Bearer <api key>.
export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if ("error" in auth) return auth.error;
  const companies = await auth.store.listCompanies();
  return NextResponse.json({ data: companies });
}
