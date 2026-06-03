// ── Domain model for Shadow GTM ────────────────────────────────────────────
// Kept deliberately small: the demo-winning loop is
//   company → scan → signal (+ AI reasoning) → ranked recommendation.

export type SignalType =
  | "pricing"
  | "product"
  | "hiring"
  | "sentiment"
  | "funding"
  | "messaging"
  | "intent"
  | "risk";

export type Impact = "high" | "medium" | "low";

/** Where a signal sits in the team's workflow. New signals are "active". */
export type SignalStatus = "active" | "handled" | "dismissed";

export interface Company {
  id: string;
  name: string;
  domain: string;
  /** Page we diff + extract pricing signals from. Defaults to https://domain/pricing */
  pricingUrl: string;
  createdAt: string;
}

export type PageType = "pricing" | "homepage";

/** A captured copy of a page so the next scan can answer "what changed?". */
export interface Snapshot {
  id: string;
  companyId: string;
  pageType: PageType;
  url: string;
  /** Cleaned, text-only content used for diffing + LLM extraction. */
  text: string;
  hash: string;
  fetchedAt: string;
}

/** The unit of intelligence the whole UI revolves around. */
export interface Signal {
  id: string;
  companyId: string;
  companyName: string;
  scanId: string;
  type: SignalType;
  /** One-line description of what was observed. */
  description: string;
  impact: Impact;
  /** 0–1 model confidence that this signal is real. */
  confidence: number;
  /** 0–100 — how big the GTM opportunity is. Drives ranking. */
  opportunityScore: number;
  /** The differentiator: WHY this matters, not just what happened. */
  reasoning: string;
  /** Concrete next move for the revenue team. */
  recommendedAction: string;
  sourceUrl: string;
  /** Verbatim quote from the source that proves the signal — drives the
   *  "Evidence" panel so claims are auditable. May be empty if the model
   *  couldn't isolate a single quote (e.g. pure pattern across many sources). */
  quote?: string;
  /** Workflow status — defaults to "active" when unset (e.g. fresh from a scan). */
  status?: SignalStatus;
  createdAt: string;
}

/** A single web finding (news/review/intent) gathered via Google Search grounding. */
export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SerpEvidence {
  title: string;
  link: string;
  snippet: string;
}

/** Per-scan context attached to a company so the UI can show what fed the AI. */
export interface ScanEvidence {
  scanId: string;
  companyId: string;
  changeSummary: string | null;
  serp: SerpEvidence[];
  /** URLs we monitored this scan (pricing + homepage etc). */
  sources: { url: string; pageType: Snapshot["pageType"] }[];
  createdAt: string;
}

export interface Scan {
  id: string;
  startedAt: string;
  finishedAt?: string;
  companyIds: string[];
  signalCount: number;
}

/** Stored, regeneratable sales-enablement artifact. */
export interface Battlecard {
  id: string;
  companyId: string;
  companyName: string;
  markdown: string;
  createdAt: string;
}

/** A multi-step research dossier on a competitor (agentic deep dive). */
export interface Dossier {
  id: string;
  companyId: string;
  companyName: string;
  markdown: string;
  createdAt: string;
}

/** One planned research angle the dossier agent will investigate. */
export interface DossierTask {
  dimension: string;
  query: string;
}

/** A saved analyst conversation (Ask Shadow memory). */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}
export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

/** A cross-competitor "state of the market" memo (one current per org). */
export interface MarketNarrative {
  markdown: string;
  createdAt: string;
}

export interface ScanCompanyResult {
  companyId: string;
  companyName: string;
  signals: Signal[];
  changeSummary: string | null;
  error?: string;
  /** Non-fatal extraction issue (e.g. the model returned unparseable output) —
   *  the scan completed but produced no signals for a diagnosable reason. */
  warning?: string;
}

/** A metered operation (Gemini extraction/retrieval, API request, …) for cost + quotas. */
export interface UsageEvent {
  kind: string;
  tokensIn?: number;
  tokensOut?: number;
  units?: number;
  scanId?: string | null;
  companyId?: string | null;
  /** Prompt/schema version attributed to this event (extraction calls). */
  promptVersion?: string | null;
  /** Wall-clock latency of the AI call in ms (for AI-ops diagnostics). */
  latencyMs?: number | null;
  /** Outcome of the op: "ok" | "error" | "empty" — powers /api/ai-ops health. */
  status?: string;
}

/** An in-app alert surfaced in the dashboard (and source for email digests). */
export interface Notification {
  id: string;
  signalId: string | null;
  companyId: string | null;
  companyName: string;
  kind: string;
  title: string;
  body: string | null;
  opportunityScore: number | null;
  readAt: string | null;
  createdAt: string;
}

/** Fields needed to create a notification (ids/timestamps filled by the store). */
export interface NewNotification {
  signalId?: string | null;
  companyId?: string | null;
  companyName: string;
  kind?: string;
  title: string;
  body?: string | null;
  opportunityScore?: number | null;
}

// ── Org / team / settings (Phase 8) ────────────────────────────────────────

export type MemberRole = "owner" | "admin" | "member";

/** A member of an org, joined with their profile email/name for display. */
export interface Member {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: MemberRole;
  createdAt: string;
}

/** A pending or accepted invitation to join an org. */
export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** Editable organization settings. */
export interface OrgSettings {
  id: string;
  name: string;
  slug: string | null;
}

/** Per-org alerting configuration (one row; defaults applied when absent). */
/** How autonomous the post-scan agent is: off, draft-recommendations, or auto-deep-dive. */
export type AutonomyLevel = "none" | "triage" | "deep_dive";

export interface AlertRule {
  minOpportunity: number;
  channels: string[];
  digestEnabled: boolean;
  autonomyLevel: AutonomyLevel;
}

/** Aggregated usage over a window, for the Usage tab + quota math. */
export interface UsageSummary {
  since: string;
  tokensIn: number;
  tokensOut: number;
  units: number;
  events: number;
  byKind: Record<string, number>;
}

/** Cadence for a background re-scan schedule. */
export type ScheduleCadence = "hourly" | "daily" | "weekly";

/** A per-company (or whole-org when companyId is null) recurring scan schedule. */
export interface Schedule {
  id: string;
  companyId: string | null;
  cadence: ScheduleCadence;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

/** A scan job that exhausted its retries — surfaced for visibility + manual retry. */
export interface FailedJob {
  id: string;
  companyId: string;
  attempts: number;
  error: string | null;
  /** Stable failure category (rate_limit | timeout | upstream | parse | …). */
  errorCode: string | null;
  /** How many times an operator has manually re-queued this job. */
  retryCount: number;
  finishedAt: string | null;
  createdAt: string;
}

// ── Billing & plans (Phase 10) ──────────────────────────────────────────────

export type PlanId = "free" | "startup" | "growth" | "enterprise";

/** Static plan definition. `null` limit = unlimited. priceMonthly -1 = custom. */
export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  blurb: string;
  limits: {
    monthlyScans: number | null;
    maxCompanies: number | null;
    maxMembers: number | null;
    /** Monthly Gemini token budget (prompt + output), across every AI op. null = unlimited. */
    monthlyTokens: number | null;
  };
}

/** An org's current subscription. Absent row ⇒ free plan (defaults in code). */
export interface Subscription {
  plan: PlanId;
  status: string; // active | trialing | past_due | canceled | none
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

// ── Integrations (Phase 11) ─────────────────────────────────────────────────

/** A third-party integration (e.g. Slack) configured for an org. */
export interface Integration {
  id: string;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

/** An outbound webhook endpoint. `secret` is omitted from list responses. */
export interface WebhookEndpoint {
  id: string;
  url: string;
  enabled: boolean;
  lastStatus: number | null;
  lastAttemptAt: string | null;
  createdAt: string;
}

/** A public-API key. The plaintext is only ever returned at creation. */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
