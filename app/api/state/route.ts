import { NextResponse } from "next/server";
import { getStore, UnauthorizedError } from "@/lib/store-context";
import { brightDataConfigured, scrapingBrowserConfigured } from "@/lib/brightdata";
import { geminiConfigured } from "@/lib/ai";
import { isMockMode, supabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single hydration endpoint for the dashboard: companies, signals, and which
// integrations are live vs mocked.
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
      brightData: brightDataConfigured(),
      scrapingBrowser: scrapingBrowserConfigured(),
      gemini: geminiConfigured(),
      supabase: supabaseConfigured(),
      mock: isMockMode(),
    },
  });
}
