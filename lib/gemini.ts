import { GoogleGenAI } from "@google/genai";
import { getEnv } from "./env";
import { withRetry, isTransient } from "./retry";
import { logger } from "./logger";

// ── Shared Gemini client + concurrency control ────────────────────────────────
// One place for the GoogleGenAI client (used by both retrieval and extraction)
// plus a global concurrency limiter. A scan bursts several calls per competitor
// (read pricing + homepage, search, extract); without a cap those fire at once
// and trip per-minute rate limits. The semaphore serializes them to a safe width
// (GEMINI_MAX_CONCURRENCY, default 1) across the whole process.

let _client: GoogleGenAI | null = null;

/** Shared GoogleGenAI client. Throws (lazily) if no key is configured. */
export function geminiClient(): GoogleGenAI {
  const apiKey = getEnv().GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return (_client ??= new GoogleGenAI({ apiKey }));
}

// ── Concurrency semaphore ─────────────────────────────────────────────────────
let active = 0;
const waiters: Array<() => void> = [];

function maxConcurrency(): number {
  const n = getEnv().GEMINI_MAX_CONCURRENCY;
  // Default 1 to stay under free-tier per-minute limits; raise on a paid key.
  return n && n > 0 ? n : 1;
}

async function acquire(): Promise<void> {
  if (active < maxConcurrency()) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release(): void {
  active--;
  waiters.shift()?.();
}

/** Run a Gemini call under the global concurrency cap. */
export async function runGemini<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

const fallbackLog = logger.child({ module: "gemini" });

/** Run a Gemini operation against the primary model with retry; on a permanent
 *  failure (retries exhausted) fall back to GEMINI_MODEL_FALLBACK once, if set.
 *  `run(model)` builds + issues the call (wrap the body in runGemini yourself for
 *  streaming, or rely on it for unary). Used by every generator so model-level
 *  quota/outage degrades gracefully instead of failing the request. */
export async function withModelFallback<T>(
  run: (model: string) => Promise<T>,
  label: string,
): Promise<T> {
  const { GEMINI_MODEL: primary, GEMINI_MODEL_FALLBACK: fallback } = getEnv();
  try {
    return await withRetry(() => run(primary), { label, shouldRetry: isTransient });
  } catch (err) {
    if (!fallback || fallback === primary) throw err;
    fallbackLog.warn("primary model failed; trying fallback", {
      label,
      primary,
      fallback,
      error: (err as Error).message,
    });
    return await withRetry(() => run(fallback), {
      label: `${label}:fallback`,
      shouldRetry: isTransient,
    });
  }
}

/** For tests/diagnostics: how many Gemini calls are in flight right now. */
export function inFlight(): number {
  return active;
}

// ── Token accounting ──────────────────────────────────────────────────────────
export interface GeminiUsage {
  tokensIn: number;
  tokensOut: number;
}

/** Prompt + output token counts from a Gemini response (or stream chunk). Streamed
 *  chunks report cumulative totals, so taking the last non-zero value yields the
 *  call total. Missing metadata → zeros. */
export function usageOf(res: {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}): GeminiUsage {
  const u = res?.usageMetadata;
  return { tokensIn: u?.promptTokenCount ?? 0, tokensOut: u?.candidatesTokenCount ?? 0 };
}

// ── Error humanization ────────────────────────────────────────────────────────
/** Turn a raw Gemini SDK error into a short, user-facing message. */
export function friendlyGeminiError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  if (/RESOURCE_EXHAUSTED|\b429\b|quota|rate limit/i.test(msg)) {
    return "Gemini rate limit reached. The free tier allows ~5 requests/min and ~20/day on gemini-2.5-flash — upgrade your Gemini plan or try again shortly.";
  }
  if (/RECITATION/i.test(msg)) {
    return "Gemini declined to reproduce a page (recitation). The page may be unreadable; try a different page to monitor.";
  }
  if (/API key|API_KEY|unauthenticated|permission/i.test(msg)) {
    return "Gemini rejected the API key — check GEMINI_API_KEY.";
  }
  // Trim a long JSON error to its message field if present.
  const m = msg.match(/"message":\s*"([^"]+)"/);
  return m ? m[1] : msg.slice(0, 200);
}
