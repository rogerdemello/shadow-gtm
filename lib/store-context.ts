import { NextResponse } from "next/server";
import { supabaseConfigured } from "./env";
import * as json from "./store";
import { storeFor, type Store } from "./store.supabase";
import { getServerClient } from "./db/server";
import { logger } from "./logger";

// ── Store resolution ──────────────────────────────────────────────────────────
// One entry point the routes call instead of importing store functions directly.
// When Supabase is configured (production) it returns a store bound to the
// signed-in user's active org, so RLS + tenancy apply. When it isn't (local demo
// without keys) it falls back to the single-tenant JSON store, keeping the
// keyless demo working.

export type { Store };

const log = logger.child({ module: "store-context" });

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

/** The legacy JSON store exposed through the shared Store interface. */
const jsonStore: Store = {
  listCompanies: json.listCompanies,
  addCompany: json.addCompany,
  removeCompany: json.removeCompany,
  getCompany: json.getCompany,
  latestSnapshot: json.latestSnapshot,
  saveSnapshot: json.saveSnapshot,
  listSignals: json.listSignals,
  replaceCompanySignals: json.replaceCompanySignals,
  createScan: json.createScan,
  saveEvidence: json.saveEvidence,
  listEvidence: json.listEvidence,
  getEvidence: json.getEvidence,
  saveBattlecard: json.saveBattlecard,
  getBattlecard: json.getBattlecard,
  loadSeedBundle: json.loadSeedBundle,
};

/** Resolve the user's active org. For now: their first membership. An explicit
 *  org switcher (cookie-backed) layers on top of this later. */
export async function resolveActiveOrgId(
  db: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.error("resolveActiveOrgId failed", error, { userId });
    return null;
  }
  return data?.org_id ?? null;
}

/** Ensure the signed-in user has an org, creating a default one on first use.
 *  Called from the authenticated app shell so every later request resolves an
 *  org. Returns the active org id. */
export async function ensureActiveOrg(): Promise<string> {
  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const existing = await resolveActiveOrgId(db, user.id);
  if (existing) return existing;

  const base = user.email?.split("@")[0] || "My";
  const name = `${base}'s workspace`;
  const { data, error } = await db.rpc("create_org_with_owner", { org_name: name });
  if (error || !data) {
    throw new Error(`Failed to create workspace: ${error?.message ?? "no data"}`);
  }
  log.info("created default org", { userId: user.id, orgId: data.id });
  return data.id;
}

/** The store for the current request. Throws UnauthorizedError when Supabase is
 *  on but there's no session — routes map that to 401. */
export async function getStore(): Promise<Store> {
  if (!supabaseConfigured()) return jsonStore;

  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const orgId = await resolveActiveOrgId(db, user.id);
  if (!orgId) {
    // No org yet — the app shell calls ensureActiveOrg() before rendering, so
    // this is a rare race; create on demand to stay correct.
    const created = await ensureActiveOrg();
    return storeFor({ db, orgId: created, userId: user.id });
  }
  return storeFor({ db, orgId, userId: user.id });
}

/** Route helper: resolve the store, or hand back a 401 response to return.
 *  Usage: `const r = await storeOr401(); if (r.res) return r.res; r.store…` */
export async function storeOr401(): Promise<
  { store: Store; res?: undefined } | { store?: undefined; res: NextResponse }
> {
  try {
    return { store: await getStore() };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    throw err;
  }
}
