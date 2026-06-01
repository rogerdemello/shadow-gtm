import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { supabaseConfigured } from "./env";
import { getServiceClient } from "./db/service";
import { storeFor, type Store } from "./store.supabase";

// ── Public-API keys ────────────────────────────────────────────────────────
// Keys look like "sk_live_<48 hex>". Only a SHA-256 hash is stored; the prefix
// (first 16 chars) is kept for display. Resolution is cross-org, so it uses the
// service client (RLS bypass) and is the one place that does.

export interface GeneratedKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

/** Mint a new API key. The plaintext is returned once and never stored. */
export function generateApiKey(): GeneratedKey {
  const plaintext = `sk_live_${randomBytes(24).toString("hex")}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, 16) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Authenticate a public-API request by `Authorization: Bearer <key>`. Returns
 *  an org-scoped store, or a NextResponse error to return. Records an
 *  `api_request` usage event for metering. */
export async function apiKeyAuth(
  req: Request,
): Promise<{ store: Store; orgId: string } | { error: NextResponse }> {
  if (!supabaseConfigured()) {
    return { error: NextResponse.json({ error: "API not available" }, { status: 503 }) };
  }
  const header = req.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key) {
    return { error: NextResponse.json({ error: "Missing API key" }, { status: 401 }) };
  }

  const db = getServiceClient();
  const { data } = await db
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!data || data.revoked_at) {
    return { error: NextResponse.json({ error: "Invalid API key" }, { status: 401 }) };
  }

  // Touch last_used_at (best-effort; don't block the request).
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  const store = storeFor({ db, orgId: data.org_id, userId: null });
  await store.recordUsage({ kind: "api_request", units: 1 });
  return { store, orgId: data.org_id };
}
