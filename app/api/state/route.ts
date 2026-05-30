import { NextResponse } from "next/server";
import { listCompanies, listSignals } from "@/lib/store";
import { brightDataConfigured, scrapingBrowserConfigured } from "@/lib/brightdata";
import { geminiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single hydration endpoint for the dashboard: companies, signals, and which
// integrations are live vs mocked.
export async function GET() {
  const [companies, signals] = await Promise.all([
    listCompanies(),
    listSignals(),
  ]);

  return NextResponse.json({
    companies,
    signals,
    config: {
      brightData: brightDataConfigured(),
      scrapingBrowser: scrapingBrowserConfigured(),
      gemini: geminiConfigured(),
      mock: process.env.SHADOW_GTM_MOCK === "1" || !process.env.BRIGHTDATA_API_TOKEN,
    },
  });
}
