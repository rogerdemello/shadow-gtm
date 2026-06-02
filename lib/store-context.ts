import { NextResponse } from "next/server";
import { supabaseConfigured } from "./env";
import * as json from "./store";
import { storeFor, type Store } from "./store.supabase";
import { getServerClient } from "./db/server";
import { logger } from "./logger";
import type { MemberRole } from "./types";

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
  addSignals: json.addSignals,
  setSignalStatus: json.setSignalStatus,
  // The JSON demo doesn't retain history; approximate with current signals.
  listSignalHistory: async (companyId: string) =>
    (await json.listSignals()).filter((s) => s.companyId === companyId),
  listSnapshots: async () => [],
  createScan: json.createScan,
  saveEvidence: json.saveEvidence,
  listEvidence: json.listEvidence,
  getEvidence: json.getEvidence,
  saveBattlecard: json.saveBattlecard,
  getBattlecard: json.getBattlecard,
  // Dossiers aren't persisted in the keyless demo (generated on demand).
  saveDossier: async () => {},
  getDossier: async () => undefined,
  // Conversations aren't persisted in the keyless demo (ephemeral chat).
  listConversations: async () => [],
  getConversation: async () => undefined,
  createConversation: async () => {
    throw new Error("Saving conversations requires a configured workspace.");
  },
  updateConversation: async () => {},
  // The keyless JSON demo doesn't meter usage or alert.
  recordUsage: async () => {},
  getAlertThreshold: async () => 70,
  createNotifications: async () => {},
  listNotifications: async () => [],
  markNotificationsRead: async () => {},
  // Team & settings don't apply to the single-tenant demo — inert stubs so the
  // interface is satisfied. The /settings UI is only reachable when Supabase is on.
  getMemberRole: async () => "owner",
  listMembers: async () => [],
  updateMemberRole: async () => {},
  removeMember: async () => {},
  listInvitations: async () => [],
  createInvitation: async () => {
    throw new Error("Invitations require a configured workspace.");
  },
  revokeInvitation: async () => {},
  getOrgSettings: async () => ({ id: "demo", name: "Demo Workspace", slug: null }),
  updateOrgName: async () => {},
  getAlertRule: async () => ({
    minOpportunity: 70,
    channels: ["in_app"],
    digestEnabled: true,
    autonomyLevel: "none" as const,
  }),
  updateAlertRule: async () => {},
  getUsageSummary: async (sinceIso: string) => ({
    since: sinceIso,
    tokensIn: 0,
    tokensOut: 0,
    units: 0,
    events: 0,
    byKind: {},
  }),
  // The keyless demo has no billing — always the free plan, writes are no-ops.
  getSubscription: async () => ({
    plan: "free" as const,
    status: "none",
    currentPeriodEnd: null,
    stripeCustomerId: null,
  }),
  upsertSubscription: async () => {},
  // Integrations require a configured workspace — inert stubs in the demo.
  getIntegration: async () => null,
  upsertIntegration: async () => {},
  deleteIntegration: async () => {},
  listWebhooks: async () => [],
  listWebhookTargets: async () => [],
  createWebhook: async () => {
    throw new Error("Webhooks require a configured workspace.");
  },
  deleteWebhook: async () => {},
  recordWebhookResult: async () => {},
  listApiKeys: async () => [],
  createApiKey: async () => {
    throw new Error("API keys require a configured workspace.");
  },
  revokeApiKey: async () => {},
  // No background queue in the demo.
  listFailedJobs: async () => [],
  retryJob: async () => {},
  // Compliance ops require a configured workspace.
  exportData: async () => ({ note: "Export is available in a configured workspace." }),
  deleteOrg: async () => {},
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

export interface ActiveContext {
  store: Store;
  orgId: string;
  userId: string;
  email: string;
  role: MemberRole;
}

/** Resolve the signed-in user's store + active org + role in one shot. Supabase
 *  only — settings/team features are gated to configured workspaces. Throws
 *  UnauthorizedError when there's no session (routes map that to 401). */
export async function getActiveContext(): Promise<ActiveContext> {
  if (!supabaseConfigured()) throw new UnauthorizedError();
  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const orgId = (await resolveActiveOrgId(db, user.id)) ?? (await ensureActiveOrg());
  const store = storeFor({ db, orgId, userId: user.id });
  const role = (await store.getMemberRole(user.id)) ?? "member";
  return { store, orgId, userId: user.id, email: user.email ?? "", role };
}

/** Like getActiveContext but returns a 401/403 response instead of throwing.
 *  Pass required roles to enforce admin-gated mutations. */
export async function contextOrError(
  roles?: MemberRole[],
): Promise<
  | { ctx: ActiveContext; res?: undefined }
  | { ctx?: undefined; res: NextResponse }
> {
  let ctx: ActiveContext;
  try {
    ctx = await getActiveContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    throw err;
  }
  if (roles && !roles.includes(ctx.role)) {
    return {
      res: NextResponse.json(
        { error: `Requires role: ${roles.join(" or ")}` },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}
