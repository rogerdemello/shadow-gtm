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
  createdAt: string;
}

/** A captured copy of a page so the next scan can answer "what changed?". */
export interface Snapshot {
  id: string;
  companyId: string;
  pageType: "pricing" | "homepage";
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
