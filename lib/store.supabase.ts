import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db/database.types";
import type {
  AlertRule,
  Battlecard,
  Company,
  Invitation,
  Member,
  MemberRole,
  NewNotification,
  Notification,
  OrgSettings,
  ApiKey,
  FailedJob,
  Integration,
  Scan,
  ScanEvidence,
  SerpEvidence,
  Signal,
  Snapshot,
  Subscription,
  UsageEvent,
  UsageSummary,
  WebhookEndpoint,
} from "./types";
import { DuplicateCompanyError, normalizeDomain } from "./store";
import { logger } from "./logger";

// ── Supabase-backed store ─────────────────────────────────────────────────────
// The production replacement for the JSON store (lib/store.ts), org-scoped and
// RLS-protected. Same operations, same domain return types — callers get an
// instance bound to a (client, orgId) context via storeFor(); workflow.ts and
// the API routes thread that context once auth lands (Phase 2).
//
// Pure row↔domain mappers live at the bottom and are unit-tested without a DB
// (the contract test that de-risks the migration). Live verification of the
// queries themselves happens against a provisioned Supabase project.

type Db = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

const PG_UNIQUE_VIOLATION = "23505";

export interface StoreContext {
  db: Db;
  orgId: string;
  /** Who is performing writes — stamped onto created_by. Optional for the worker. */
  userId?: string | null;
}

export interface Store {
  listCompanies(): Promise<Company[]>;
  addCompany(input: {
    name: string;
    domain: string;
    pricingUrl?: string;
  }): Promise<Company>;
  removeCompany(companyId: string): Promise<void>;
  getCompany(companyId: string): Promise<Company | undefined>;

  latestSnapshot(
    companyId: string,
    pageType: Snapshot["pageType"],
  ): Promise<Snapshot | undefined>;
  saveSnapshot(snap: Snapshot): Promise<void>;

  listSignals(): Promise<Signal[]>;
  /** Replace a company's CURRENT signals with this scan's output, keeping history. */
  replaceCompanySignals(companyId: string, signals: Signal[]): Promise<void>;
  /** Full append-only signal history for a company (current + past), oldest first. */
  listSignalHistory(companyId: string): Promise<Signal[]>;
  /** Set a signal's workflow status (active/handled/dismissed). */
  setSignalStatus(signalId: string, status: Signal["status"]): Promise<void>;
  /** All retained snapshots for a company, newest first (audit trail). */
  listSnapshots(companyId: string): Promise<Snapshot[]>;

  createScan(companyIds: string[]): Promise<Scan>;

  saveEvidence(ev: ScanEvidence): Promise<void>;
  listEvidence(): Promise<ScanEvidence[]>;
  getEvidence(companyId: string): Promise<ScanEvidence | undefined>;

  saveBattlecard(card: Battlecard): Promise<void>;
  getBattlecard(companyId: string): Promise<Battlecard | undefined>;

  /** Record a metered operation (cost + quota tracking). Best-effort. */
  recordUsage(event: UsageEvent): Promise<void>;

  /** The org's opportunity-score alert threshold (default 70 when unset). */
  getAlertThreshold(): Promise<number>;
  createNotifications(items: NewNotification[]): Promise<void>;
  listNotifications(limit?: number): Promise<Notification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;

  // ── Team & settings (Phase 8) ──────────────────────────────────────────────
  /** This user's role in the active org (null if not a member). */
  getMemberRole(userId: string): Promise<MemberRole | null>;
  /** Org members joined with their profile email/name. */
  listMembers(): Promise<Member[]>;
  updateMemberRole(userId: string, role: MemberRole): Promise<void>;
  removeMember(userId: string): Promise<void>;
  /** Pending + accepted invitations for the org, newest first. */
  listInvitations(): Promise<Invitation[]>;
  createInvitation(input: {
    email: string;
    role: MemberRole;
    token: string;
    invitedBy: string | null;
  }): Promise<Invitation>;
  revokeInvitation(id: string): Promise<void>;
  getOrgSettings(): Promise<OrgSettings>;
  updateOrgName(name: string): Promise<void>;
  /** Full alert config (threshold + channels + digest), defaults when unset. */
  getAlertRule(): Promise<AlertRule>;
  updateAlertRule(patch: Partial<AlertRule>): Promise<void>;
  /** Aggregate metered usage since the given ISO timestamp. */
  getUsageSummary(sinceIso: string): Promise<UsageSummary>;

  // ── Billing (Phase 10) ─────────────────────────────────────────────────────
  /** The org's subscription (defaults to the free plan when no row exists). */
  getSubscription(): Promise<Subscription>;
  /** Upsert subscription state — called by the Stripe webhook (service client). */
  upsertSubscription(sub: {
    plan: Subscription["plan"];
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
  }): Promise<void>;

  // ── Integrations (Phase 11) ────────────────────────────────────────────────
  getIntegration(provider: string): Promise<Integration | null>;
  upsertIntegration(
    provider: string,
    config: Record<string, unknown>,
    enabled: boolean,
  ): Promise<void>;
  deleteIntegration(provider: string): Promise<void>;
  /** Webhook endpoints without secrets (for the settings UI). */
  listWebhooks(): Promise<WebhookEndpoint[]>;
  /** Enabled endpoints WITH their signing secret (for dispatch only). */
  listWebhookTargets(): Promise<
    { id: string; url: string; secret: string }[]
  >;
  createWebhook(input: { url: string; secret: string }): Promise<WebhookEndpoint>;
  deleteWebhook(id: string): Promise<void>;
  recordWebhookResult(id: string, status: number): Promise<void>;
  listApiKeys(): Promise<ApiKey[]>;
  createApiKey(input: {
    name: string;
    keyHash: string;
    prefix: string;
    createdBy: string | null;
  }): Promise<ApiKey>;
  revokeApiKey(id: string): Promise<void>;

  // ── Reliability (Phase 13) ─────────────────────────────────────────────────
  /** Scan jobs that exhausted retries (dead-letter), newest first. */
  listFailedJobs(): Promise<FailedJob[]>;
  /** Re-queue a failed job for another attempt. */
  retryJob(id: string): Promise<void>;

  // ── Compliance (Phase 14) ──────────────────────────────────────────────────
  /** Full export of the org's data (GDPR data-portability). */
  exportData(): Promise<Record<string, unknown>>;
  /** Delete the active org and (via FK cascade) all its data. Owner-gated by RLS. */
  deleteOrg(): Promise<void>;
}

/** Bind the store operations to one org's data through the given client. */
export function storeFor(ctx: StoreContext): Store {
  const { db, orgId, userId = null } = ctx;

  /** Surface a PostgREST error as a thrown Error with context. */
  function fail(op: string, error: { message: string } | null): void {
    if (error) throw new Error(`store.${op} failed: ${error.message}`);
  }

  return {
    // ── Companies ─────────────────────────────────────────────────────────
    async listCompanies() {
      const { data, error } = await db
        .from("companies")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      fail("listCompanies", error);
      return (data ?? []).map(rowToCompany);
    },

    async addCompany(input) {
      const domain = normalizeDomain(input.domain);
      const insert: Tables["companies"]["Insert"] = {
        org_id: orgId,
        name: input.name.trim(),
        domain,
        pricing_url: input.pricingUrl?.trim() || `https://${domain}/pricing`,
        created_by: userId,
      };
      const { data, error } = await db
        .from("companies")
        .insert(insert)
        .select("*")
        .single();
      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) throw new DuplicateCompanyError(domain);
        throw new Error(`store.addCompany failed: ${error.message}`);
      }
      return rowToCompany(data);
    },

    async removeCompany(companyId) {
      // ON DELETE CASCADE clears the company's snapshots/signals/evidence/cards.
      const { error } = await db
        .from("companies")
        .delete()
        .eq("org_id", orgId)
        .eq("id", companyId);
      fail("removeCompany", error);
    },

    async getCompany(companyId) {
      const { data, error } = await db
        .from("companies")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", companyId)
        .maybeSingle();
      fail("getCompany", error);
      return data ? rowToCompany(data) : undefined;
    },

    // ── Snapshots ───────────────────────────────────────────────────────────
    async latestSnapshot(companyId, pageType) {
      const { data, error } = await db
        .from("snapshots")
        .select("*")
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .eq("page_type", pageType)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fail("latestSnapshot", error);
      return data ? rowToSnapshot(data) : undefined;
    },

    async saveSnapshot(snap) {
      const insert: Tables["snapshots"]["Insert"] = {
        id: snap.id,
        org_id: orgId,
        company_id: snap.companyId,
        page_type: snap.pageType,
        url: snap.url,
        text: snap.text,
        hash: snap.hash,
        fetched_at: snap.fetchedAt,
      };
      const { error } = await db.from("snapshots").insert(insert);
      fail("saveSnapshot", error);
      // Trim to the two most recent per (company, page) — enough to diff — so the
      // text column doesn't grow unbounded. Best-effort; a failure here is logged
      // by the caller, not fatal to the scan.
      await pruneSnapshots(db, orgId, snap.companyId, snap.pageType);
    },

    // ── Signals (append-only history) ─────────────────────────────────────────
    async listSignals() {
      const { data, error } = await db
        .from("signals")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      fail("listSignals", error);
      return (data ?? []).map(rowToSignal);
    },

    async setSignalStatus(signalId, status) {
      const { error } = await db
        .from("signals")
        .update({ status: status ?? "active" })
        .eq("org_id", orgId)
        .eq("id", signalId);
      fail("setSignalStatus", error);
    },

    async listSignalHistory(companyId) {
      const { data, error } = await db
        .from("signals")
        .select("*")
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      fail("listSignalHistory", error);
      return (data ?? []).map(rowToSignal);
    },

    async listSnapshots(companyId) {
      const { data, error } = await db
        .from("snapshots")
        .select("*")
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .order("fetched_at", { ascending: false });
      fail("listSnapshots", error);
      return (data ?? []).map(rowToSnapshot);
    },

    async replaceCompanySignals(companyId, signals) {
      // Flip the prior set to not-current (RPC keeps it a single statement under
      // RLS), then insert the fresh set (is_current defaults to true).
      const { error: rpcError } = await db.rpc("set_signals_not_current", {
        target_company: companyId,
      });
      fail("replaceCompanySignals.flip", rpcError);

      if (signals.length === 0) return;
      const rows: Tables["signals"]["Insert"][] = signals.map((s) => ({
        id: s.id,
        org_id: orgId,
        company_id: s.companyId,
        company_name: s.companyName,
        scan_id: s.scanId,
        type: s.type,
        description: s.description,
        impact: s.impact,
        confidence: s.confidence,
        opportunity_score: s.opportunityScore,
        reasoning: s.reasoning,
        recommended_action: s.recommendedAction,
        source_url: s.sourceUrl,
        quote: s.quote ?? null,
        is_current: true,
        created_at: s.createdAt,
      }));
      const { error } = await db.from("signals").insert(rows);
      fail("replaceCompanySignals.insert", error);
    },

    // ── Scans ─────────────────────────────────────────────────────────────────
    async createScan(companyIds) {
      const { data, error } = await db
        .from("scans")
        .insert({ org_id: orgId, company_ids: companyIds, signal_count: 0 })
        .select("*")
        .single();
      fail("createScan", error);
      return rowToScan(data!);
    },

    // ── Evidence ────────────────────────────────────────────────────────────
    async saveEvidence(ev) {
      const insert: Tables["scan_evidence"]["Insert"] = {
        org_id: orgId,
        company_id: ev.companyId,
        scan_id: ev.scanId,
        change_summary: ev.changeSummary,
        serp: ev.serp,
        sources: ev.sources,
        created_at: ev.createdAt,
      };
      const { error } = await db.from("scan_evidence").insert(insert);
      fail("saveEvidence", error);
    },

    async listEvidence() {
      // Latest row per company (history accrues; we surface "now").
      const { data, error } = await db
        .from("scan_evidence")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      fail("listEvidence", error);
      return latestPerCompany(data ?? []).map(rowToEvidence);
    },

    async getEvidence(companyId) {
      const { data, error } = await db
        .from("scan_evidence")
        .select("*")
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fail("getEvidence", error);
      return data ? rowToEvidence(data) : undefined;
    },

    // ── Battlecards ───────────────────────────────────────────────────────────
    async saveBattlecard(card) {
      const insert: Tables["battlecards"]["Insert"] = {
        org_id: orgId,
        company_id: card.companyId,
        company_name: card.companyName,
        markdown: card.markdown,
        created_at: card.createdAt,
      };
      const { error } = await db
        .from("battlecards")
        .upsert(insert, { onConflict: "org_id,company_id" });
      fail("saveBattlecard", error);
    },

    async getBattlecard(companyId) {
      const { data, error } = await db
        .from("battlecards")
        .select("*")
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .maybeSingle();
      fail("getBattlecard", error);
      return data ? rowToBattlecard(data) : undefined;
    },

    // ── Usage metering ──────────────────────────────────────────────────────
    async recordUsage(event) {
      const insert: Tables["usage_events"]["Insert"] = {
        org_id: orgId,
        kind: event.kind,
        tokens_in: event.tokensIn ?? 0,
        tokens_out: event.tokensOut ?? 0,
        units: event.units ?? 1,
        scan_id: event.scanId ?? null,
        company_id: event.companyId ?? null,
        prompt_version: event.promptVersion ?? null,
      };
      const { error } = await db.from("usage_events").insert(insert);
      // Best-effort: metering must never break a scan. Log and move on.
      if (error) {
        logger.warn("recordUsage failed", { kind: event.kind, error: error.message });
      }
    },

    // ── Alerting ──────────────────────────────────────────────────────────────
    async getAlertThreshold() {
      const { data } = await db
        .from("alert_rules")
        .select("min_opportunity")
        .eq("org_id", orgId)
        .maybeSingle();
      return data?.min_opportunity ?? 70;
    },

    async createNotifications(items) {
      if (items.length === 0) return;
      const rows: Tables["notifications"]["Insert"][] = items.map((n) => ({
        org_id: orgId,
        signal_id: n.signalId ?? null,
        company_id: n.companyId ?? null,
        company_name: n.companyName,
        kind: n.kind ?? "signal",
        title: n.title,
        body: n.body ?? null,
        opportunity_score: n.opportunityScore ?? null,
      }));
      const { error } = await db.from("notifications").insert(rows);
      if (error) logger.warn("createNotifications failed", { error: error.message });
    },

    async listNotifications(limit = 50) {
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      fail("listNotifications", error);
      return (data ?? []).map(rowToNotification);
    },

    async markNotificationsRead(ids) {
      if (ids.length === 0) return;
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .in("id", ids);
      fail("markNotificationsRead", error);
    },

    // ── Team & settings ────────────────────────────────────────────────────
    async getMemberRole(userId) {
      const { data, error } = await db
        .from("org_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();
      fail("getMemberRole", error);
      return data?.role ?? null;
    },

    async listMembers() {
      const { data, error } = await db
        .from("org_members")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      fail("listMembers", error);
      const members = data ?? [];
      // Join profile email/name in a second query (no FK embed in hand-authored types).
      const ids = members.map((m) => m.user_id);
      const profiles = new Map<string, { email: string | null; full_name: string | null }>();
      if (ids.length) {
        const { data: profs } = await db
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ids);
        for (const p of profs ?? []) profiles.set(p.id, { email: p.email, full_name: p.full_name });
      }
      return members.map((m) => ({
        userId: m.user_id,
        email: profiles.get(m.user_id)?.email ?? null,
        fullName: profiles.get(m.user_id)?.full_name ?? null,
        role: m.role,
        createdAt: m.created_at,
      }));
    },

    async updateMemberRole(userId, role) {
      const { error } = await db
        .from("org_members")
        .update({ role })
        .eq("org_id", orgId)
        .eq("user_id", userId);
      fail("updateMemberRole", error);
    },

    async removeMember(userId) {
      const { error } = await db
        .from("org_members")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", userId);
      fail("removeMember", error);
    },

    async listInvitations() {
      const { data, error } = await db
        .from("invitations")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      fail("listInvitations", error);
      return (data ?? []).map(rowToInvitation);
    },

    async createInvitation(input) {
      const insert: Tables["invitations"]["Insert"] = {
        org_id: orgId,
        email: input.email.trim().toLowerCase(),
        role: input.role,
        token: input.token,
        invited_by: input.invitedBy,
      };
      const { data, error } = await db
        .from("invitations")
        .insert(insert)
        .select("*")
        .single();
      fail("createInvitation", error);
      return rowToInvitation(data!);
    },

    async revokeInvitation(id) {
      const { error } = await db
        .from("invitations")
        .delete()
        .eq("org_id", orgId)
        .eq("id", id);
      fail("revokeInvitation", error);
    },

    async getOrgSettings() {
      const { data, error } = await db
        .from("orgs")
        .select("id, name, slug")
        .eq("id", orgId)
        .maybeSingle();
      fail("getOrgSettings", error);
      return { id: orgId, name: data?.name ?? "Workspace", slug: data?.slug ?? null };
    },

    async updateOrgName(name) {
      const { error } = await db
        .from("orgs")
        .update({ name: name.trim() })
        .eq("id", orgId);
      fail("updateOrgName", error);
    },

    async getAlertRule() {
      const { data } = await db
        .from("alert_rules")
        .select("min_opportunity, channels, digest_enabled")
        .eq("org_id", orgId)
        .maybeSingle();
      return {
        minOpportunity: data?.min_opportunity ?? 70,
        channels: data?.channels ?? ["in_app"],
        digestEnabled: data?.digest_enabled ?? true,
      };
    },

    async updateAlertRule(patch) {
      const row: Tables["alert_rules"]["Insert"] = { org_id: orgId };
      if (patch.minOpportunity !== undefined) row.min_opportunity = patch.minOpportunity;
      if (patch.channels !== undefined) row.channels = patch.channels;
      if (patch.digestEnabled !== undefined) row.digest_enabled = patch.digestEnabled;
      // Upsert: the row may not exist yet (defaults applied in code until then).
      const { error } = await db
        .from("alert_rules")
        .upsert(row, { onConflict: "org_id" });
      fail("updateAlertRule", error);
    },

    async getUsageSummary(sinceIso) {
      const { data, error } = await db
        .from("usage_events")
        .select("kind, tokens_in, tokens_out, units")
        .eq("org_id", orgId)
        .gte("created_at", sinceIso);
      fail("getUsageSummary", error);
      const rows = data ?? [];
      const byKind: Record<string, number> = {};
      let tokensIn = 0;
      let tokensOut = 0;
      let units = 0;
      for (const r of rows) {
        tokensIn += r.tokens_in ?? 0;
        tokensOut += r.tokens_out ?? 0;
        units += r.units ?? 0;
        byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      }
      return { since: sinceIso, tokensIn, tokensOut, units, events: rows.length, byKind };
    },

    // ── Billing ────────────────────────────────────────────────────────────
    async getSubscription() {
      const { data } = await db
        .from("subscriptions")
        .select("plan, status, stripe_customer_id, current_period_end")
        .eq("org_id", orgId)
        .maybeSingle();
      return {
        plan: data?.plan ?? "free",
        status: data?.status ?? "none",
        currentPeriodEnd: data?.current_period_end ?? null,
        stripeCustomerId: data?.stripe_customer_id ?? null,
      };
    },

    async upsertSubscription(sub) {
      const row: Tables["subscriptions"]["Insert"] = {
        org_id: orgId,
        plan: sub.plan,
        status: sub.status,
        stripe_customer_id: sub.stripeCustomerId,
        stripe_subscription_id: sub.stripeSubscriptionId,
        current_period_end: sub.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db
        .from("subscriptions")
        .upsert(row, { onConflict: "org_id" });
      fail("upsertSubscription", error);
    },

    // ── Integrations ─────────────────────────────────────────────────────────
    async getIntegration(provider) {
      const { data, error } = await db
        .from("integrations")
        .select("*")
        .eq("org_id", orgId)
        .eq("provider", provider)
        .maybeSingle();
      fail("getIntegration", error);
      return data ? rowToIntegration(data) : null;
    },

    async upsertIntegration(provider, config, enabled) {
      const row: Tables["integrations"]["Insert"] = { org_id: orgId, provider, config, enabled };
      const { error } = await db
        .from("integrations")
        .upsert(row, { onConflict: "org_id,provider" });
      fail("upsertIntegration", error);
    },

    async deleteIntegration(provider) {
      const { error } = await db
        .from("integrations")
        .delete()
        .eq("org_id", orgId)
        .eq("provider", provider);
      fail("deleteIntegration", error);
    },

    async listWebhooks() {
      const { data, error } = await db
        .from("webhook_endpoints")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      fail("listWebhooks", error);
      return (data ?? []).map(rowToWebhook);
    },

    async listWebhookTargets() {
      const { data, error } = await db
        .from("webhook_endpoints")
        .select("id, url, secret")
        .eq("org_id", orgId)
        .eq("enabled", true);
      fail("listWebhookTargets", error);
      return (data ?? []).map((r) => ({ id: r.id, url: r.url, secret: r.secret }));
    },

    async createWebhook(input) {
      const { data, error } = await db
        .from("webhook_endpoints")
        .insert({ org_id: orgId, url: input.url, secret: input.secret })
        .select("*")
        .single();
      fail("createWebhook", error);
      return rowToWebhook(data!);
    },

    async deleteWebhook(id) {
      const { error } = await db
        .from("webhook_endpoints")
        .delete()
        .eq("org_id", orgId)
        .eq("id", id);
      fail("deleteWebhook", error);
    },

    async recordWebhookResult(id, status) {
      const { error } = await db
        .from("webhook_endpoints")
        .update({ last_status: status, last_attempt_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", id);
      if (error) logger.warn("recordWebhookResult failed", { error: error.message });
    },

    async listApiKeys() {
      const { data, error } = await db
        .from("api_keys")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      fail("listApiKeys", error);
      return (data ?? []).map(rowToApiKey);
    },

    async createApiKey(input) {
      const { data, error } = await db
        .from("api_keys")
        .insert({
          org_id: orgId,
          name: input.name,
          key_hash: input.keyHash,
          prefix: input.prefix,
          created_by: input.createdBy,
        })
        .select("*")
        .single();
      fail("createApiKey", error);
      return rowToApiKey(data!);
    },

    async revokeApiKey(id) {
      const { error } = await db
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", id);
      fail("revokeApiKey", error);
    },

    // ── Reliability: dead-letter jobs ──────────────────────────────────────
    async listFailedJobs() {
      const { data, error } = await db
        .from("scan_jobs")
        .select("id, company_id, attempts, error, finished_at, created_at")
        .eq("org_id", orgId)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(50);
      fail("listFailedJobs", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        attempts: r.attempts,
        error: r.error,
        finishedAt: r.finished_at,
        createdAt: r.created_at,
      }));
    },

    async retryJob(id) {
      const { error } = await db
        .from("scan_jobs")
        .update({
          status: "pending",
          attempts: 0,
          error: null,
          run_at: new Date().toISOString(),
          started_at: null,
          finished_at: null,
        })
        .eq("org_id", orgId)
        .eq("id", id)
        .eq("status", "failed");
      fail("retryJob", error);
    },

    // ── Compliance ────────────────────────────────────────────────────────
    async exportData() {
      const [companies, signals, evidence, settings, alertRule, subscription] =
        await Promise.all([
          this.listCompanies(),
          this.listSignals(),
          this.listEvidence(),
          this.getOrgSettings(),
          this.getAlertRule(),
          this.getSubscription(),
        ]);
      // Per-company history (append-only signal trail + battlecards).
      const history = await Promise.all(
        companies.map(async (c) => ({
          companyId: c.id,
          signals: await this.listSignalHistory(c.id),
          snapshots: await this.listSnapshots(c.id),
          battlecard: (await this.getBattlecard(c.id)) ?? null,
        })),
      );
      return {
        exportedAt: new Date().toISOString(),
        org: settings,
        subscription,
        alertRule,
        companies,
        currentSignals: signals,
        evidence,
        history,
      };
    },

    async deleteOrg() {
      const { error } = await db.from("orgs").delete().eq("id", orgId);
      fail("deleteOrg", error);
    },

  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pruneSnapshots(
  db: Db,
  orgId: string,
  companyId: string,
  pageType: Snapshot["pageType"],
): Promise<void> {
  const { data } = await db
    .from("snapshots")
    .select("id")
    .eq("org_id", orgId)
    .eq("company_id", companyId)
    .eq("page_type", pageType)
    .order("fetched_at", { ascending: false });
  const stale = (data ?? []).slice(2).map((r) => r.id);
  if (stale.length) await db.from("snapshots").delete().in("id", stale);
}

function latestPerCompany<T extends { company_id: string; created_at: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  // rows arrive newest-first; keep the first occurrence per company.
  for (const r of rows) {
    if (seen.has(r.company_id)) continue;
    seen.add(r.company_id);
    out.push(r);
  }
  return out;
}

// ── Pure row → domain mappers (unit-tested) ────────────────────────────────────

export function rowToCompany(r: Tables["companies"]["Row"]): Company {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    pricingUrl: r.pricing_url,
    createdAt: r.created_at,
  };
}

export function rowToSnapshot(r: Tables["snapshots"]["Row"]): Snapshot {
  return {
    id: r.id,
    companyId: r.company_id,
    pageType: r.page_type,
    url: r.url,
    text: r.text,
    hash: r.hash,
    fetchedAt: r.fetched_at,
  };
}

export function rowToSignal(r: Tables["signals"]["Row"]): Signal {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    scanId: r.scan_id ?? "",
    type: r.type,
    description: r.description,
    impact: r.impact,
    confidence: r.confidence,
    opportunityScore: r.opportunity_score,
    reasoning: r.reasoning,
    recommendedAction: r.recommended_action,
    sourceUrl: r.source_url,
    quote: r.quote ?? undefined,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function rowToScan(r: Tables["scans"]["Row"]): Scan {
  return {
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? undefined,
    companyIds: r.company_ids,
    signalCount: r.signal_count,
  };
}

export function rowToEvidence(r: Tables["scan_evidence"]["Row"]): ScanEvidence {
  return {
    scanId: r.scan_id ?? "",
    companyId: r.company_id,
    changeSummary: r.change_summary,
    serp: (r.serp as SerpEvidence[] | null) ?? [],
    sources: (r.sources as ScanEvidence["sources"] | null) ?? [],
    createdAt: r.created_at,
  };
}

export function rowToNotification(r: Tables["notifications"]["Row"]): Notification {
  return {
    id: r.id,
    signalId: r.signal_id,
    companyId: r.company_id,
    companyName: r.company_name,
    kind: r.kind,
    title: r.title,
    body: r.body,
    opportunityScore: r.opportunity_score,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export function rowToBattlecard(r: Tables["battlecards"]["Row"]): Battlecard {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    markdown: r.markdown,
    createdAt: r.created_at,
  };
}

export function rowToInvitation(r: Tables["invitations"]["Row"]): Invitation {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    token: r.token,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
  };
}

export function rowToIntegration(r: Tables["integrations"]["Row"]): Integration {
  return {
    id: r.id,
    provider: r.provider,
    config: (r.config as Record<string, unknown> | null) ?? {},
    enabled: r.enabled,
    createdAt: r.created_at,
  };
}

export function rowToWebhook(r: Tables["webhook_endpoints"]["Row"]): WebhookEndpoint {
  return {
    id: r.id,
    url: r.url,
    enabled: r.enabled,
    lastStatus: r.last_status,
    lastAttemptAt: r.last_attempt_at,
    createdAt: r.created_at,
  };
}

export function rowToApiKey(r: Tables["api_keys"]["Row"]): ApiKey {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}
