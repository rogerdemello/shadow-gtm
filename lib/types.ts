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

export interface Company {
  id: string;
  name: string;
  domain: string;
  /** Page we diff + extract pricing signals from. Defaults to https://domain/pricing */
  pricingUrl: string;
  /** Render via Bright Data Scraping Browser (for JS-heavy / interactive sites). */
  renderJs?: boolean;
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
  createdAt: string;
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

export interface ScanCompanyResult {
  companyId: string;
  companyName: string;
  signals: Signal[];
  changeSummary: string | null;
  error?: string;
}

/** A metered operation (Gemini call, Bright Data fetch, …) for cost + quotas. */
export interface UsageEvent {
  kind: string;
  tokensIn?: number;
  tokensOut?: number;
  units?: number;
  scanId?: string | null;
  companyId?: string | null;
}
