import { GoogleGenAI } from "@google/genai";
import type { SerpResult } from "./types";
import { getEnv } from "./env";
import { logger } from "./logger";
import { withRetry, isTransient } from "./retry";

// ── Gemini-native web retrieval ───────────────────────────────────────────────
// Replaces the Bright Data layer. Live web data comes straight from the Gemini
// API's grounding tools — no proxy, no scraping infra, one key:
//
//   • URL context  → read a competitor's pricing/home page (real page content)
//   • Google Search → live news / reviews / hiring / funding / intent, grounded
//
// NOTE: grounding tools can't be combined with structured JSON output in a single
// Gemini call, so retrieval (here, free-text + tools) and signal extraction
// (lib/ai.ts, structured) are deliberately separate calls.

const log = logger.child({ module: "retrieval" });

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  const apiKey = getEnv().GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return (_client ??= new GoogleGenAI({ apiKey }));
}

function model(): string {
  return getEnv().GEMINI_MODEL;
}

/**
 * Read a public web page via Gemini's URL-context tool and return its visible
 * text. This is the real, live content of the page (as the model reads it) —
 * used to diff "what changed" and to feed signal extraction.
 */
export async function fetchPageText(url: string): Promise<string> {
  const prompt = `Read this web page and output its complete visible text content as plain text. Preserve pricing tables, plan names, prices, feature lists, and headings exactly. Do not summarize, interpret, or add commentary — output only the page's text.\n\nURL: ${url}`;

  const response = await withRetry(
    () =>
      client().models.generateContent({
        model: model(),
        contents: prompt,
        config: { tools: [{ urlContext: {} }] },
      }),
    { label: "gemini:urlContext", shouldRetry: isTransient },
  );

  const text = (response.text ?? "").trim();
  if (!text) {
    log.warn("urlContext returned empty text", { url });
  }
  return text;
}

/**
 * Live web search via Gemini's Google Search grounding. Returns grounded
 * findings (real, cited URLs). Parses a simple `TITLE :: URL :: snippet` line
 * format the model is asked to emit (structured output can't be used alongside
 * the search tool).
 */
export async function searchWeb(query: string, num = 8): Promise<SerpResult[]> {
  const prompt = `Use Google Search to find the most recent and relevant developments about: ${query}.
Look for pricing changes, product launches, funding/news, hiring, customer sentiment/reviews, and buying-intent signals.
Return up to ${num} findings. Output ONLY one finding per line in EXACTLY this format (no numbering, no preamble, no markdown):
TITLE :: URL :: one-sentence factual snippet`;

  const response = await withRetry(
    () =>
      client().models.generateContent({
        model: model(),
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      }),
    { label: "gemini:googleSearch", shouldRetry: isTransient },
  );

  return parseFindings(response.text ?? "", num);
}

/** Parse `TITLE :: URL :: snippet` lines into SerpResults; tolerant of noise. */
export function parseFindings(text: string, limit: number): SerpResult[] {
  const out: SerpResult[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || !line.includes("::")) continue;
    const parts = line.split("::").map((p) => p.trim());
    if (parts.length < 2) continue;
    const [title, link, snippet = ""] = parts;
    if (!/^https?:\/\//i.test(link)) continue;
    out.push({ title: title.replace(/^[-*\d.\s]+/, ""), link, snippet });
    if (out.length >= limit) break;
  }
  return out;
}

/** True once Gemini is configured — the only key a scan now needs. */
export function retrievalConfigured(): boolean {
  return Boolean(getEnv().GEMINI_API_KEY);
}
