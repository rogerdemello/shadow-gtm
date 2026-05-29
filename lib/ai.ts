import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Company, PageType, Signal, SignalType } from "./types";
import type { SerpResult } from "./brightdata";
import { id } from "./store";
import { clip } from "./html";

// ── Claude integration ──────────────────────────────────────────────────────
// One structured call per company turns scraped web text into fully-reasoned
// GTM signals (the extraction + reasoning layers folded into a single pass to
// keep the live scan responsive). A second free-text call generates battlecards
// on demand. System prompts are stable and cache-friendly.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "medium") as
  | "low"
  | "medium"
  | "high"
  | "max";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return (_client ??= new Anthropic());
}

// ── Structured signal schema ────────────────────────────────────────────────
const SIGNAL_TYPES: [SignalType, ...SignalType[]] = [
  "pricing",
  "product",
  "hiring",
  "sentiment",
  "funding",
  "messaging",
  "intent",
  "risk",
];

const SignalSchema = z.object({
  type: z.enum(SIGNAL_TYPES),
  description: z.string().describe("One line: what was observed."),
  impact: z.enum(["high", "medium", "low"]),
  confidence: z.number().describe("0-1: how sure this signal is real."),
  opportunityScore: z
    .number()
    .describe("0-100: size of the GTM opportunity this opens."),
  reasoning: z
    .string()
    .describe(
      "WHY it matters — the second-order implication, not a restatement.",
    ),
  recommendedAction: z.string().describe("The concrete next move for sales."),
  sourceUrl: z.string().describe("The URL this signal came from."),
  quote: z
    .string()
    .describe(
      "VERBATIM quote (≤200 chars) from the source text that proves this signal — copy exactly what's written, do not paraphrase. Empty string only if no single quote captures it.",
    ),
});

const ExtractionSchema = z.object({
  signals: z.array(SignalSchema),
});

// Frozen system prompt → cacheable prefix (engages once it exceeds the model's
// min cacheable size; harmless below it).
const ANALYST_SYSTEM = `You are a senior GTM (go-to-market) intelligence analyst for a B2B SaaS revenue team. You read live web data about a competitor and surface ACTIONABLE intelligence for sales, marketing, and RevOps.

Your job is two steps, fused into one structured output:
1. EXTRACT discrete signals from the data — pricing changes, new features/products, hiring patterns, customer sentiment, funding/news, positioning/messaging shifts, buying-intent signals, and risk signals.
2. REASON about each one. The differentiator is the "reasoning" field: never restate the observation. Explain the second-order implication for a revenue team. Example — observation: "raised Starter price 60%". Reasoning: "Likely moving upmarket; their SMB base is now under-served and price-sensitive — a displacement window is opening."

Scoring rules:
- impact: how much this matters strategically.
- confidence: 0-1, lower it when the data is thin or ambiguous. Do NOT invent signals; if the data shows nothing noteworthy, return fewer signals (or none).
- opportunityScore: 0-100. High = a clear, near-term play a rep could run this week.
- recommendedAction: specific and runnable (e.g. "Launch a migration campaign targeting their SMB customers with a cost-comparison battlecard"), not generic advice.

Evidence rule (non-negotiable): every signal MUST carry a verbatim quote (≤200 chars) copied exactly from the supplied text — the pricing page, the change summary, or a SERP snippet. Do NOT paraphrase. If you cannot find a real quote, omit the signal. This is what makes the intelligence auditable.

Quality bar: 2-5 high-signal items beat 10 noisy ones. Only surface what a sharp analyst would flag. Attribute each signal to the source URL it came from.`;

interface ExtractInputPage {
  pageType: PageType;
  url: string;
  text: string;
}

interface ExtractInput {
  company: Company;
  pages: ExtractInputPage[];
  serp: SerpResult[];
  changeSummary: string | null;
  scanId: string;
}

/** Extract + reason in one structured Claude call. Returns persisted-shape signals. */
export async function extractSignals(input: ExtractInput): Promise<Signal[]> {
  const { company, pages, serp, changeSummary, scanId } = input;

  const serpBlock = serp.length
    ? serp
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.link}\n${r.snippet}`)
        .join("\n\n")
    : "(no search results)";

  const changeBlock = changeSummary
    ? `\n## What changed since the last scan\n${changeSummary}\n`
    : "";

  // Split the per-page text budget so a richer homepage doesn't drown the
  // pricing page — keep total under ~16k chars.
  const perPageBudget = Math.max(3000, Math.floor(16000 / Math.max(1, pages.length)));
  const pagesBlock = pages
    .map(
      (p) =>
        `## ${p.pageType.toUpperCase()} page (${p.url})\n${clip(p.text, perPageBudget) || "(page could not be fetched)"}`,
    )
    .join("\n\n");

  const primaryUrl = pages[0]?.url || "";

  const userContent = `Analyze this competitor: **${company.name}** (${company.domain}).
${changeBlock}
${pagesBlock}

## Live web search signals (news, reviews, forums, hiring)
${serpBlock}

Return structured signals. Use the URLs above as sourceUrl values.`;

  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: ANALYST_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(ExtractionSchema),
    },
    messages: [{ role: "user", content: userContent }],
  });

  const parsed = response.parsed_output;
  if (!parsed) return [];

  const now = new Date().toISOString();
  return parsed.signals.map((s) => ({
    id: id(),
    companyId: company.id,
    companyName: company.name,
    scanId,
    type: s.type,
    description: s.description,
    impact: s.impact,
    confidence: clamp(s.confidence, 0, 1),
    opportunityScore: Math.round(clamp(s.opportunityScore, 0, 100)),
    reasoning: s.reasoning,
    recommendedAction: s.recommendedAction,
    sourceUrl: s.sourceUrl || primaryUrl,
    quote: (s.quote || "").trim().slice(0, 240) || undefined,
    createdAt: now,
  }));
}

const BATTLECARD_SYSTEM = `You are a competitive enablement strategist. Given a competitor and a set of intelligence signals, produce a crisp sales battlecard in Markdown. Sections:
- **Why we win** (3-4 bullets, tied to the signals)
- **Their weaknesses right now** (grounded in the signals — quote what changed)
- **Objection handling** (2-3 likely objections + responses)
- **Outbound angle** (a short, specific cold-email opener a rep can send today)
Be specific and punchy. No preamble, no closing remarks — just the battlecard.`;

function signalDigest(signals: Signal[]): string {
  if (!signals.length) return "(no live signals captured yet)";
  return signals
    .map(
      (s) =>
        `- [${s.type}/${s.impact}, opp ${s.opportunityScore}] ${s.description} — ${s.reasoning}`,
    )
    .join("\n");
}

/** Generate a Markdown battlecard for a company from its signals. */
export async function generateBattlecard(
  company: Company,
  signals: Signal[],
): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: BATTLECARD_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { effort: EFFORT },
    messages: [
      {
        role: "user",
        content: `Competitor: ${company.name} (${company.domain})\n\nSignals:\n${signalDigest(signals)}\n\nWrite the battlecard.`,
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Streaming version — yields markdown deltas as Claude generates the card. */
export async function* streamBattlecard(
  company: Company,
  signals: Signal[],
): AsyncGenerator<string> {
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: BATTLECARD_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { effort: EFFORT },
    messages: [
      {
        role: "user",
        content: `Competitor: ${company.name} (${company.domain})\n\nSignals:\n${signalDigest(signals)}\n\nWrite the battlecard.`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

const WARROOM_SYSTEM = `You are an elite competitive GTM strategist running a "war room" for a B2B SaaS revenue team. Given a target competitor (with live intelligence signals) and the operator's directive, produce a sharp, executable attack plan in Markdown. Sections:
- **Thesis** (1-2 sentences: the core opening and why now, grounded in the signals)
- **Exploitable weaknesses** (bullets — quote the specific signals/changes that create them)
- **Pricing & positioning gaps** (where they're vulnerable and how we wedge in)
- **Who to hit first** (the segment/account profile with the strongest intent right now)
- **30-day campaign** (concrete plays across outbound, content, and timing)
- **Outbound opener** (a short, specific cold-email opener a rep can send today)
Be aggressive, specific, and grounded in the provided signals — never generic. If the directive names a segment or angle, build the plan around it. No preamble, no caveats — just the plan.`;

/** War Room: turn a directive + live signals into an executable attack plan. */
export async function generateAttackPlan(
  directive: string,
  companyName: string | null,
  signals: Signal[],
): Promise<string> {
  const target = companyName
    ? `Target competitor: ${companyName}`
    : "Target: the overall competitive set";

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: WARROOM_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { effort: EFFORT },
    messages: [
      {
        role: "user",
        content: `${target}\n\nOperator directive: "${directive}"\n\nLive intelligence signals:\n${signalDigest(
          signals,
        )}\n\nWrite the attack plan.`,
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Streaming attack plan — same shape, but yields markdown chunks as they land. */
export async function* streamAttackPlan(
  directive: string,
  companyName: string | null,
  signals: Signal[],
): AsyncGenerator<string> {
  const target = companyName
    ? `Target competitor: ${companyName}`
    : "Target: the overall competitive set";

  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: WARROOM_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { effort: EFFORT },
    messages: [
      {
        role: "user",
        content: `${target}\n\nOperator directive: "${directive}"\n\nLive intelligence signals:\n${signalDigest(
          signals,
        )}\n\nWrite the attack plan.`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
