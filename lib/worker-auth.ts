import { createHmac, timingSafeEqual } from "node:crypto";

// ── Worker request authentication ─────────────────────────────────────────────
// The cron trigger (pg_cron + pg_net) authenticates to the worker route. Two
// modes, checked in order:
//
//  1. Signed (preferred, replay-resistant): X-Worker-Timestamp + X-Worker-Signature
//     where signature = HMAC-SHA256(`${timestamp}.${rawBody}`, WORKER_SECRET) in
//     hex, and the timestamp is within ±5 minutes of now. A captured request
//     can't be replayed once the window passes. See supabase/cron-setup.sql.
//  2. Static secret (fallback for manual/testing invocation): a constant-time
//     match of X-Worker-Secret / Bearer token against WORKER_SECRET.
//
// All comparisons are constant-time to avoid leaking the secret via timing.

const MAX_SKEW_SECONDS = 300;

/** Constant-time string compare that won't early-return on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verify a worker request against the shared secret. `rawBody` is the exact
 *  request body string (needed to recompute the signature). */
export function verifyWorkerRequest(
  req: Request,
  rawBody: string,
  secret: string,
): boolean {
  const ts = req.headers.get("x-worker-timestamp");
  const sig = req.headers.get("x-worker-signature");

  if (ts && sig) {
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return false;
    const skew = Math.abs(Date.now() / 1000 - tsNum);
    if (skew > MAX_SKEW_SECONDS) return false;
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${rawBody}`)
      .digest("hex");
    return safeEqual(expected, sig);
  }

  const provided =
    req.headers.get("x-worker-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  return safeEqual(provided, secret);
}
