import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db/database.types";
import type {
  Battlecard,
  Company,
  NewNotification,
  Notification,
  Scan,
  ScanEvidence,
  SerpEvidence,
  Signal,
  Snapshot,
  UsageEvent,
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
    renderJs?: boolean;
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

  loadSeedBundle(bundle: {
    companies: Company[];
    signals: Signal[];
    evidence: ScanEvidence[];
    battlecards: Battlecard[];
  }): Promise<void>;
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
        render_js: Boolean(input.renderJs),
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

    // ── Demo seed ─────────────────────────────────────────────────────────────
    async loadSeedBundle(bundle) {
      // Replace the calling org's state only. Delete companies first; cascades
      // clear dependent rows, then re-insert the bundle under this org.
      const { error: delErr } = await db
        .from("companies")
        .delete()
        .eq("org_id", orgId);
      fail("loadSeedBundle.clear", delErr);

      if (bundle.companies.length) {
        const { error } = await db.from("companies").insert(
          bundle.companies.map((c) => ({
            id: c.id,
            org_id: orgId,
            name: c.name,
            domain: c.domain,
            pricing_url: c.pricingUrl,
            render_js: Boolean(c.renderJs),
            created_by: userId,
            created_at: c.createdAt,
          })),
        );
        fail("loadSeedBundle.companies", error);
      }

      // Signals/evidence carry a scan_id (FK → scans). Create the referenced
      // scan rows first so the seed inserts satisfy the constraint.
      const scanIds = [
        ...new Set(
          [
            ...bundle.signals.map((s) => s.scanId),
            ...bundle.evidence.map((e) => e.scanId),
          ].filter((x): x is string => Boolean(x)),
        ),
      ];
      if (scanIds.length) {
        const { error } = await db.from("scans").insert(
          scanIds.map((sid) => ({
            id: sid,
            org_id: orgId,
            company_ids: bundle.companies.map((c) => c.id),
            signal_count: bundle.signals.length,
          })),
        );
        fail("loadSeedBundle.scans", error);
      }

      if (bundle.signals.length) {
        await this.batchInsertSeedSignals(bundle.signals);
      }
      for (const ev of bundle.evidence) await this.saveEvidence(ev);
      for (const card of bundle.battlecards) await this.saveBattlecard(card);
    },

    // Internal helper kept off the public interface but reachable via `this`.
    async batchInsertSeedSignals(signals: Signal[]) {
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
      fail("loadSeedBundle.signals", error);
    },
  } as Store & { batchInsertSeedSignals(signals: Signal[]): Promise<void> };
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
    renderJs: r.render_js,
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
