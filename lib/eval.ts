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
  {
    name: "product-launch-ai",
    company: { name: "Cirrus", domain: "cirrus.dev" },
    pages: [
      {
        pageType: "homepage",
        url: "https://cirrus.dev/",
        text: "Introducing Cirrus Copilot — our new AI assistant that writes and reviews code inside the editor. Available today on all paid plans.",
      },
    ],
    expect: { expectTypes: ["product"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "product",
        opportunityScore: 72,
        description: "Shipped an AI coding assistant",
        sourceUrl: "https://cirrus.dev/",
        quote: "Introducing Cirrus Copilot — our new AI assistant that writes and reviews code inside the editor.",
      }),
    ],
  },
  {
    name: "funding-round",
    company: { name: "Delta", domain: "delta.ai" },
    pages: [
      {
        pageType: "homepage",
        url: "https://delta.ai/blog/series-b",
        text: "We've raised a $40M Series B led by Sequoia to accelerate our go-to-market and double the engineering team.",
      },
    ],
    expect: { expectTypes: ["funding"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "funding",
        opportunityScore: 70,
        description: "Raised a $40M Series B",
        sourceUrl: "https://delta.ai/blog/series-b",
        quote: "We've raised a $40M Series B led by Sequoia",
      }),
    ],
  },
  {
    name: "messaging-repositioning",
    company: { name: "Echo", domain: "echo.com" },
    pages: [
      {
        pageType: "homepage",
        url: "https://echo.com/",
        text: "Echo is now the platform for enterprise compliance teams. We've moved beyond SMB note-taking to serve regulated industries.",
      },
    ],
    expect: { expectTypes: ["messaging"], minTopOpportunity: 50, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "messaging",
        opportunityScore: 66,
        description: "Repositioning upmarket to enterprise compliance",
        sourceUrl: "https://echo.com/",
        quote: "Echo is now the platform for enterprise compliance teams.",
      }),
    ],
  },
  {
    name: "negative-sentiment",
    company: { name: "Foxtrot", domain: "foxtrot.io" },
    pages: [
      {
        pageType: "homepage",
        url: "https://foxtrot.io/reviews",
        text: "Customer reviews: many users report that support response times have gotten much worse since the last release, with tickets going unanswered for days.",
      },
    ],
    expect: { expectTypes: ["sentiment"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "sentiment",
        opportunityScore: 74,
        description: "Support quality complaints rising",
        sourceUrl: "https://foxtrot.io/reviews",
        quote: "support response times have gotten much worse since the last release",
      }),
    ],
  },
  {
    name: "pricing-drop",
    company: { name: "Golf", domain: "golf.app" },
    pages: [
      {
        pageType: "pricing",
        url: "https://golf.app/pricing",
        text: "New lower pricing: the Pro plan is now $19 per month, down from $39 per month, with no change to features.",
      },
    ],
    expect: { expectTypes: ["pricing"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "pricing",
        opportunityScore: 71,
        description: "Cut Pro price ~51%",
        quote: "the Pro plan is now $19 per month, down from $39 per month",
      }),
    ],
  },
  {
    name: "intent-rfp",
    company: { name: "Hotel", domain: "hotel.co" },
    pages: [
      {
        pageType: "homepage",
        url: "https://hotel.co/procurement",
        text: "We are evaluating vendors for a company-wide rollout of a new customer data platform in Q3 and invite proposals.",
      },
    ],
    expect: { expectTypes: ["intent"], minTopOpportunity: 50, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "intent",
        opportunityScore: 69,
        description: "Active buying intent for a CDP",
        sourceUrl: "https://hotel.co/procurement",
        quote: "We are evaluating vendors for a company-wide rollout of a new customer data platform in Q3",
      }),
    ],
  },
  {
    name: "risk-outage",
    company: { name: "India", domain: "india.net" },
    pages: [
      {
        pageType: "homepage",
        url: "https://india.net/status",
        text: "Post-incident report: a multi-region outage took the platform offline for 6 hours, affecting all customers and breaching several SLAs.",
      },
    ],
    expect: { expectTypes: ["risk"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "risk",
        opportunityScore: 76,
        description: "Major outage breached SLAs",
        sourceUrl: "https://india.net/status",
        quote: "a multi-region outage took the platform offline for 6 hours",
      }),
    ],
  },
  {
    name: "packaging-tier-removed",
    company: { name: "Juliet", domain: "juliet.com" },
    pages: [
      {
        pageType: "pricing",
        url: "https://juliet.com/pricing",
        text: "We are retiring the Free tier on August 1. Existing free users must upgrade to a paid plan starting at $25 per month to keep access.",
      },
    ],
    expect: { expectTypes: ["pricing"], minTopOpportunity: 55, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "pricing",
        opportunityScore: 78,
        description: "Killing the free tier — displacement window",
        quote: "We are retiring the Free tier on August 1.",
      }),
    ],
  },
  {
    name: "product-deprecation",
    company: { name: "Kilo", domain: "kilo.io" },
    pages: [
      {
        pageType: "homepage",
        url: "https://kilo.io/changelog",
        text: "End of life: the legacy Analytics API will be shut down on October 1 and is no longer receiving updates. Migrate to v2.",
      },
    ],
    expect: { expectTypes: ["product"], minTopOpportunity: 50, requireQuotes: true },
    sampleSignals: [
      sampleSignal({
        type: "product",
        opportunityScore: 64,
        description: "Deprecating the legacy Analytics API",
        sourceUrl: "https://kilo.io/changelog",
        quote: "the legacy Analytics API will be shut down on October 1",
      }),
    ],
  },
];
