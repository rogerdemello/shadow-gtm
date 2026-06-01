import type { Signal, SignalType } from "./types";

// ── Extraction eval harness ──────────────────────────────────────────────────
// Pure scoring of an extraction against expectations, plus a small golden set.
// The eval runner (eval/extraction.eval.ts) runs extractSignals against the
// golden page text when GEMINI_API_KEY is set; otherwise it scores each case's
// `sampleSignals` so the harness itself is validated keyless + deterministically.

export interface Expectation {
  /** Signal types a good extraction should surface from the page text. */
  expectTypes: SignalType[];
  /** The top opportunity score should be at least this. */
  minTopOpportunity?: number;
  /** Every signal must carry a verbatim quote that appears in the source text. */
  requireQuotes?: boolean;
}

export interface GoldenCase {
  name: string;
  company: { name: string; domain: string };
  pages: { pageType: "pricing" | "homepage"; url: string; text: string }[];
  expect: Expectation;
  /** Representative output used for keyless scoring of the harness. */
  sampleSignals: Signal[];
}

export interface ScoreCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface ScoreResult {
  score: number; // 0..1 = fraction of checks passed
  checks: ScoreCheck[];
}

const norm = (s: string): string => s.replace(/\s+/g, " ").toLowerCase().trim();

/** Score an extraction against expectations. Pure — no IO. */
export function scoreExtraction(
  signals: Signal[],
  pagesText: string,
  exp: Expectation,
): ScoreResult {
  const checks: ScoreCheck[] = [];

  checks.push({ name: "non-empty", pass: signals.length > 0 });

  for (const t of exp.expectTypes) {
    checks.push({ name: `found:${t}`, pass: signals.some((s) => s.type === t) });
  }

  if (exp.minTopOpportunity != null) {
    const top = signals.reduce((m, s) => Math.max(m, s.opportunityScore), 0);
    checks.push({
      name: `topOpp>=${exp.minTopOpportunity}`,
      pass: top >= exp.minTopOpportunity,
      detail: `top=${top}`,
    });
  }

  if (exp.requireQuotes) {
    const src = norm(pagesText);
    const withQuote = signals.filter((s) => s.quote && s.quote.trim());
    const verbatim = withQuote.filter((s) => src.includes(norm(s.quote!)));
    checks.push({
      name: "all-have-quotes",
      pass: signals.length > 0 && withQuote.length === signals.length,
      detail: `${withQuote.length}/${signals.length}`,
    });
    checks.push({
      name: "quotes-verbatim",
      pass: withQuote.length > 0 && verbatim.length === withQuote.length,
      detail: `${verbatim.length}/${withQuote.length}`,
    });
  }

  const passed = checks.filter((c) => c.pass).length;
  return { score: checks.length ? passed / checks.length : 0, checks };
}

function sampleSignal(p: Partial<Signal> & { type: SignalType; quote: string }): Signal {
  return {
    id: "eval",
    companyId: "eval",
    companyName: "Eval",
    scanId: "eval",
    impact: "high",
    confidence: 0.9,
    opportunityScore: 80,
    description: "d",
    reasoning: "r",
    recommendedAction: "a",
    sourceUrl: "https://example.com/pricing",
    createdAt: "2026-06-01T00:00:00Z",
    ...p,
  };
}

export const GOLDEN: GoldenCase[] = [
  {
    name: "pricing-hike-upmarket",
    company: { name: "Acme", domain: "acme.com" },
    pages: [
      {
        pageType: "pricing",
        url: "https://acme.com/pricing",
        text: "Pricing. Our Starter plan is now $50 per month, up from $30 per month. Enterprise plans include SSO and advanced security.",
      },
    ],
    expect: { expectTypes: ["pricing"], minTopOpportunity: 60, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "pricing",
        opportunityScore: 84,
        description: "Starter price raised 67%",
        quote: "Our Starter plan is now $50 per month, up from $30 per month.",
      }),
    ],
  },
  {
    name: "aggressive-hiring",
    company: { name: "Beta", domain: "beta.io" },
    pages: [
      {
        pageType: "homepage",
        url: "https://beta.io/",
        text: "Careers. We are hiring 20 enterprise account executives this quarter to expand into the mid-market.",
      },
    ],
    expect: { expectTypes: ["hiring"], minTopOpportunity: 50, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "hiring",
        opportunityScore: 68,
        description: "Scaling enterprise sales",
        sourceUrl: "https://beta.io/",
        quote: "We are hiring 20 enterprise account executives this quarter",
      }),
    ],
  },
];
