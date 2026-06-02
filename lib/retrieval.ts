import type { SerpResult } from "./types";
import { getEnv } from "./env";
import { geminiClient, runGemini } from "./gemini";
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

function model(): string {
  return getEnv().GEMINI_MODEL;
}

/** A successful call that returned no usable text — treat as transient + retry. */
class EmptyResponseError extends Error {
  constructor(tool: string) {
    super(`${tool} returned empty text`);
    this.name = "EmptyResponseError";
  }
}

const retryableOrEmpty = (err: unknown): boolean =>
  err instanceof EmptyResponseError || isTransient(err);

/**
 * Read a public web page via Gemini's URL-context tool and return a factual
 * brief of its content (plans, prices, features, headline claims). We ask for an
 * extraction rather than a verbatim dump on purpose: reproducing a page word-for-
 * word trips Gemini's RECITATION guardrail (returns empty), whereas a factual
 * brief returns the real, live content — comprehensive and stable enough to diff
 * "what changed" and to feed signal extraction.
 */
export async function fetchPageText(url: string): Promise<string> {
  const prompt = `Using the content of this web page, write a factual brief of what it presents. List each plan/tier or product with its price or fee, key features or limits, and any headline claims, promotions, or notable copy. Use short labelled lines and quote prices, plan names, and key phrases exactly as written. Be comprehensive and consistent (this is used for change-tracking across scans). Output ONLY the brief — no preamble, reasoning, or commentary.\n\nURL: ${url}`;

  try {
    // Under load, Gemini can return finishReason STOP with EMPTY text (not an
    // error) — retry those too, not just transport errors.
    return await withRetry(
      async () => {
        const response = await runGemini(() =>
          geminiClient().models.generateContent({
            model: model(),
            contents: prompt,
            config: { tools: [{ urlContext: {} }] },
          }),
        );
        const text = (response.text ?? "").trim();
        if (!text) throw new EmptyResponseError("urlContext");
        return text;
      },
      { label: "gemini:urlContext", shouldRetry: retryableOrEmpty },
    );
  } catch (err) {
    // Exhausted retries — degrade gracefully so one unreadable page doesn't fail
    // the whole scan; extraction will note the page couldn't be read.
    log.warn("urlContext failed; returning empty page text", {
      url,
      error: (err as Error).message,
    });
    return "";
  }
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

  try {
    const response = await withRetry(
      async () => {
        const res = await runGemini(() =>
          geminiClient().models.generateContent({
            model: model(),
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
          }),
        );
        const text = (res.text ?? "").trim();
        // Empty only counts as a (retryable) failure if there's also no grounding.
        if (!text && groundingChunks(res).length === 0) {
          throw new EmptyResponseError("googleSearch");
        }
        return res;
      },
      { label: "gemini:googleSearch", shouldRetry: retryableOrEmpty },
    );

    const parsed = parseFindings(response.text ?? "", num);
    if (parsed.length > 0) return parsed;

    // Fallback: not all models emit the line format. Use the grounding metadata's
    // cited sources (the real URLs the answer was grounded in).
    return groundingChunks(response)
      .map((c) => ({ title: c.title || c.uri, link: c.uri, snippet: "" }))
      .filter((r) => /^https?:\/\//i.test(r.link))
      .slice(0, num);
  } catch (err) {
    // Search is best-effort — the scan still runs on page content alone.
    log.warn("googleSearch failed; returning no findings", {
      error: (err as Error).message,
    });
    return [];
  }
}

/** Extract { uri, title } from a response's grounding metadata (model-agnostic). */
function groundingChunks(res: unknown): { uri: string; title: string }[] {
  const candidates = (res as { candidates?: unknown[] })?.candidates;
  const meta = (candidates?.[0] as { groundingMetadata?: { groundingChunks?: unknown[] } })
    ?.groundingMetadata;
  const chunks = meta?.groundingChunks ?? [];
  return chunks
    .map((c) => (c as { web?: { uri?: string; title?: string } }).web)
    .filter((w): w is { uri?: string; title?: string } => Boolean(w))
    .map((w) => ({ uri: w.uri ?? "", title: w.title ?? "" }))
    .filter((w) => w.uri);
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
