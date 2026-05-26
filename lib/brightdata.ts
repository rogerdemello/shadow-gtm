import { mockPage, mockSerp } from "./mock";

// ── Bright Data client ──────────────────────────────────────────────────────
// Uses the unified Bright Data API endpoint (https://api.brightdata.com/request),
// which proxies a target URL through a named zone and returns the result. This
// is the simplest integration for a server runtime — no proxy/TLS plumbing.
//
//   • Web Unlocker zone  → fetch any public page (bypasses bot detection/CAPTCHA)
//   • SERP API zone      → structured Google results via &brd_json=1
//
// Docs: https://docs.brightdata.com/api-reference/unlocker  (Direct API)

const API_URL = "https://api.brightdata.com/request";
const TIMEOUT_MS = 60_000;

export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
}

export class BrightDataError extends Error {}

function token(): string {
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (!t) throw new BrightDataError("BRIGHTDATA_API_TOKEN is not set");
  return t;
}

function isMock(): boolean {
  return process.env.SHADOW_GTM_MOCK === "1" || !process.env.BRIGHTDATA_API_TOKEN;
}

async function brdRequest(zone: string, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ zone, url, format: "raw" }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      throw new BrightDataError(
        `Bright Data ${res.status} on zone "${zone}": ${body.slice(0, 300)}`,
      );
    }
    return body;
  } catch (err) {
    if (err instanceof BrightDataError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new BrightDataError(`Bright Data request timed out after ${TIMEOUT_MS}ms`);
    }
    throw new BrightDataError(`Bright Data request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a public page's HTML through the Web Unlocker zone. */
export async function fetchPage(url: string): Promise<string> {
  if (isMock()) return mockPage(url);
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "web_unlocker1";
  return brdRequest(zone, url);
}

/** Fetch a fully-rendered page via the Bright Data Scraping Browser (CDP).
 *  Use for JS-heavy / interactive sites (e.g. LinkedIn) where the Web Unlocker's
 *  static HTML isn't enough. Connects to Bright Data's remote Chrome over a
 *  WebSocket endpoint — no local browser needed. */
export async function fetchPageRendered(url: string): Promise<string> {
  if (isMock()) return mockPage(url);

  const ws = process.env.BRIGHTDATA_BROWSER_WS;
  if (!ws) {
    throw new BrightDataError(
      "BRIGHTDATA_BROWSER_WS is not set (Scraping Browser CDP endpoint)",
    );
  }

  // Imported lazily so the dependency only loads when rendering is actually used.
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.connect({ browserWSEndpoint: ws });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    // Let SPA content settle, but don't hang the whole scan if it never idles.
    await page
      .waitForNetworkIdle({ idleTime: 1500, timeout: 15_000 })
      .catch(() => {});
    return await page.content();
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Structured Google results for a query through the SERP API zone. */
export async function serpSearch(query: string, num = 10): Promise<SerpResult[]> {
  if (isMock()) return mockSerp(query);
  const zone = process.env.BRIGHTDATA_SERP_ZONE || "serp_api1";
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&brd_json=1`;
  const raw = await brdRequest(zone, url);

  try {
    const data = JSON.parse(raw) as {
      organic?: Array<{ title?: string; link?: string; description?: string }>;
    };
    return (data.organic ?? [])
      .map((r) => ({
        title: r.title ?? "",
        link: r.link ?? "",
        snippet: r.description ?? "",
      }))
      .filter((r) => r.title && r.link);
  } catch {
    // Some SERP zones return HTML if brd_json isn't enabled; degrade gracefully.
    throw new BrightDataError(
      "SERP zone did not return JSON. Enable parsing (brd_json) on the zone or check the zone name.",
    );
  }
}

export function brightDataConfigured(): boolean {
  return Boolean(process.env.BRIGHTDATA_API_TOKEN) && process.env.SHADOW_GTM_MOCK !== "1";
}

export function scrapingBrowserConfigured(): boolean {
  return Boolean(process.env.BRIGHTDATA_BROWSER_WS) && process.env.SHADOW_GTM_MOCK !== "1";
}
