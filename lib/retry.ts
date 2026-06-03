import { logger } from "./logger";

// ── Retry with exponential backoff ────────────────────────────────────────────
// Wraps a flaky async call (Gemini retrieval/extraction, webhooks) so transient failures —
// timeouts, 429s, 5xx — retry a few times with jittered backoff before giving
// up. Permanent failures (auth, bad request) should set shouldRetry=false so we
// fail fast instead of hammering. Errors are logged, never swallowed.

const log = logger.child({ module: "retry" });

export interface RetryOptions {
  /** Max attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay in ms; doubles each attempt. Default 400. */
  baseDelayMs?: number;
  /** Cap on a single backoff delay. Default 8000. */
  maxDelayMs?: number;
  /** Return false to stop retrying a given error (e.g. 4xx). Default: retry all. */
  shouldRetry?: (err: unknown) => boolean;
  /** Label for logs. */
  label?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deterministic-ish jitter without Math.random in the hot path isn't required
// here (this is runtime code, not a workflow), but a small +/- spread avoids
// thundering-herd retries when many scans fail at once.
function backoff(attempt: number, base: number, cap: number): number {
  const exp = Math.min(cap, base * 2 ** (attempt - 1));
  const jitter = exp * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 400,
    maxDelayMs = 8000,
    shouldRetry = () => true,
    label = "operation",
  } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = attempt < attempts && shouldRetry(err);
      if (!retryable) break;
      const delay = backoff(attempt, baseDelayMs, maxDelayMs);
      log.warn(`${label} failed (attempt ${attempt}/${attempts}), retrying`, {
        delayMs: delay,
        error: (err as Error)?.message,
      });
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Persist a generated artifact (dossier/narrative/battlecard) with one retry on
 *  transient failure. On permanent failure, invoke onFail (e.g. to emit a
 *  `persist_failed` SSE event) instead of silently swallowing it — generated AI
 *  content is expensive and the user must know it wasn't saved. Returns whether
 *  the write succeeded. */
export async function persistWithRetry(
  fn: () => Promise<void>,
  onFail: (err: Error) => void,
  label = "persist",
): Promise<boolean> {
  try {
    await withRetry(fn, { attempts: 2, label, shouldRetry: isTransient });
    return true;
  } catch (err) {
    log.error(`${label} failed permanently`, err as Error);
    onFail(err as Error);
    return false;
  }
}

/** Heuristic: retry network/timeout/429/5xx, not 4xx client errors. Use as the
 *  default shouldRetry for HTTP-ish failures. */
export function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  // A client-cancelled request (disconnect) must never be retried.
  if ((err as Error)?.name === "AbortError" || /\babort/.test(msg)) return false;
  if (/(\b4\d\d\b|invalid|unauthorized|forbidden|not found|bad request)/.test(msg)) {
    // 429 is retryable despite being 4xx.
    return /\b429\b|rate limit|too many/.test(msg);
  }
  return true; // timeouts, resets, 5xx, unknown → worth a retry
}
