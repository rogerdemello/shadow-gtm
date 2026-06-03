import { NextResponse } from "next/server";

// ── Idempotency keys ──────────────────────────────────────────────────────────
// Honor a client-supplied `Idempotency-Key` header on create endpoints so a
// double-click or a network retry doesn't create a duplicate resource. The first
// response (status + body) for a (route, key) pair is remembered and replayed for
// a TTL window.
//
// Scope caveat (same as lib/ratelimit): state is in-process. On a multi-instance
// deployment dedupe is per-instance; for a hard global guarantee back this with a
// shared store. For single-instance / self-host it is exact. Keys are assumed
// client-unique (UUIDs), so collisions across tenants aren't a concern.

interface Entry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

/** The Idempotency-Key header, trimmed, or null. Caps length to avoid abuse. */
export function idempotencyKey(req: Request): string | null {
  const k = req.headers.get("idempotency-key")?.trim();
  if (!k || k.length > 200) return null;
  return k;
}

/** Replay the remembered response for this (route, key), or null if first-seen. */
export function replayIdempotent(route: string, key: string | null): NextResponse | null {
  if (!key) return null;
  const e = store.get(`${route}:${key}`);
  if (e && e.expiresAt > Date.now()) {
    return NextResponse.json(e.body as Record<string, unknown>, {
      status: e.status,
      headers: { "Idempotent-Replay": "true" },
    });
  }
  return null;
}

/** Remember a create response so a later replay returns it verbatim. */
export function rememberIdempotent(
  route: string,
  key: string | null,
  status: number,
  body: unknown,
): void {
  if (!key) return;
  const now = Date.now();
  if (store.size > MAX_ENTRIES) {
    for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
  }
  store.set(`${route}:${key}`, { status, body, expiresAt: now + TTL_MS });
}
