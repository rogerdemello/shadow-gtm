import { NextResponse } from "next/server";
import { getStore, UnauthorizedError } from "@/lib/store-context";
import { geminiConfigured, supabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single hydration endpoint for the dashboard: companies, signals, and which
// providers are configured (Gemini, Supabase).
export async function GET() {
  let store;
  try {
    store = await getStore();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const [companies, signals] = await Promise.all([
    store.listCompanies(),
    store.listSignals(),
  ]);

  return NextResponse.json({
    companies,
    signals,
    config: {
      gemini: geminiConfigured(),
      supabase: supabaseConfigured(),
    },
  });
}
