import { Type } from "@google/genai";
import { z } from "zod";
import type { Company, DossierTask, Signal } from "./types";
import type { SerpResult } from "./types";
import { getEnv } from "./env";
import { geminiClient, runGemini, friendlyGeminiError } from "./gemini";
import { extractSignals } from "./ai";
import { searchWeb } from "./retrieval";
import { withRetry, isTransient } from "./retry";
import { logger } from "./logger";

// ── Agentic deep-dive dossier ─────────────────────────────────────────────────
// A multi-step research agent for one competitor:
//   1. PLAN    — Gemini picks the highest-value research angles + search queries
//   2. GATHER  — one grounded Google search per angle (real, cited findings)
//   3. SYNTHESIZE — Gemini writes a cited Markdown dossier from the findings
// Streamed as events so the UI can narrate progress. Heavier than a scan (~7
// Gemini calls), so it's an explicit on-demand action; the global limiter
// (lib/gemini) keeps it under rate caps.

const log = logger.child({ module: "dossier" });
const model = (): string => getEnv().GEMINI_MODEL;

// 3 keeps a deep dive to ~5 Gemini calls (plan + 3 searches + synthesis) — free-
// tier friendly. Raise on a paid key for broader coverage.
const MAX_TASKS = 3;

const DEFAULT_TASKS: DossierTask[] = [
  { dimension: "Funding & financials", query: "funding round valuation revenue financials" },
  { dimension: "Product & roadmap", query: "new product launches roadmap features" },
  { dimension: "Pricing & packaging", query: "pricing plans changes packaging tiers" },
  { dimension: "Customers & traction", query: "customers case studies logos market share growth" },
  { dimension: "Sentiment & reviews", query: "reviews complaints G2 reputation glassdoor" },
];

function defaultTasks(company: Company): DossierTask[] {
  const subject = `${company.name} (${company.domain})`;
  return DEFAULT_TASKS.map((t) => ({ dimension: t.dimension, query: `${subject} ${t.query}` }));
}

const PlanZ = z.object({
  tasks: z.array(z.object({ dimension: z.string(), query: z.string() })),
});

const PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dimension: { type: Type.STRING, description: "Short research angle name." },
          query: { type: Type.STRING, description: "A focused web-search query for it." },
        },
        required: ["dimension", "query"],
      },
    },
  },
  required: ["tasks"],
} as const;

const PLAN_SYSTEM =
  "You are a competitive-intelligence lead planning a research dossier. Pick the highest-value angles to investigate for the given company and write one focused web-search query per angle. Favor angles a revenue team cares about: funding, product, pricing, customers, sentiment, leadership, hiring.";

/** Step 1 — plan the research angles (falls back to defaults on any failure). */
export async function planDossier(company: Company): Promise<DossierTask[]> {
  try {
    const res = await withRetry(
      () =>
        runGemini(() =>
          geminiClient().models.generateContent({
            model: model(),
            contents: `Plan a competitive-intelligence dossier on ${company.name} (${company.domain}). Choose the ${MAX_TASKS} highest-value research angles and a focused web-search query for each.`,
            config: {
              systemInstruction: PLAN_SYSTEM,
              responseMimeType: "application/json",
              responseSchema: PLAN_SCHEMA,
              maxOutputTokens: 1024,
            },
          }),
        ),
      { label: "dossier:plan", shouldRetry: isTransient },
    );
    const parsed = PlanZ.parse(JSON.parse(res.text ?? "{}"));
    const tasks = parsed.tasks
      .filter((t) => t.dimension.trim() && t.query.trim())
      .slice(0, MAX_TASKS);
    return tasks.length ? tasks : defaultTasks(company);
  } catch (err) {
    log.warn("plan failed; using default angles", { error: (err as Error).message });
    return defaultTasks(company);
  }
}

interface Gathered {
  dimension: string;
  results: SerpResult[];
}

/** Format gathered findings into a cited context block for synthesis (pure). */
export function buildContext(gathered: Gathered[]): string {
  return gathered
    .map((g) => {
      const body = g.results.length
        ? g.results
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.link}\n${r.snippet}`)
            .join("\n\n")
        : "(no findings)";
      return `## ${g.dimension}\n${body}`;
    })
    .join("\n\n");
}

const DOSSIER_SYSTEM = `You are a senior competitive-intelligence analyst. Write a sharp, factual dossier on the competitor in Markdown from the supplied grounded research findings. Structure:
- **Overview** — what they are, who they serve, current trajectory.
- One **section per research angle** — summarize what the findings show; cite sources inline as [n] using the numbered findings.
- **Strategic assessment** — their strengths, their weaknesses/exposure, and concrete openings where WE could win.
- **Watch list** — the few things worth monitoring next.
Ground every claim in the findings; if the findings are thin on an angle, say so plainly rather than inventing. Be concise and specific. No preamble — start with the Overview heading.`;

/** Step 3 — synthesize the dossier, streamed as Markdown deltas. */
async function* synthesize(company: Company, context: string): AsyncGenerator<string> {
  const stream = await withRetry(
    () =>
      runGemini(() =>
        geminiClient().models.generateContentStream({
          model: model(),
          contents: `Competitor: ${company.name} (${company.domain})\n\nGrounded research findings:\n${context}\n\nWrite the dossier.`,
          config: { systemInstruction: DOSSIER_SYSTEM, maxOutputTokens: 6144 },
        }),
      ),
    { label: "dossier:synthesis", shouldRetry: isTransient },
  );
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

export type DossierEvent =
  | { type: "plan"; tasks: DossierTask[] }
  | { type: "gather"; dimension: string; found: number }
  | { type: "synthesis" }
  | { type: "delta"; text: string }
  | { type: "done"; markdown: string }
  | { type: "error"; error: string };

/** Turn a finished dossier into structured signals that feed the pipeline.
 *  Reuses the scan extractor over the dossier text. Best-effort → [] on failure. */
export async function dossierToSignals(company: Company, markdown: string): Promise<Signal[]> {
  if (!markdown.trim()) return [];
  try {
    const { signals } = await extractSignals({
      company,
      pages: [{ pageType: "homepage", url: `${company.domain} (deep-dive dossier)`, text: markdown }],
      serp: [],
      changeSummary: null,
      scanId: "",
    });
    return signals;
  } catch (err) {
    log.warn("dossierToSignals failed", { error: (err as Error).message });
    return [];
  }
}

/** Run the full agent, yielding progress events then the final dossier. */
export async function* runDossierStream(company: Company): AsyncGenerator<DossierEvent> {
  let markdown = "";
  try {
    const tasks = await planDossier(company);
    yield { type: "plan", tasks };

    const gathered: Gathered[] = [];
    for (const task of tasks) {
      const results = await searchWeb(task.query, 5).catch(() => [] as SerpResult[]);
      gathered.push({ dimension: task.dimension, results });
      yield { type: "gather", dimension: task.dimension, found: results.length };
    }

    yield { type: "synthesis" };
    for await (const delta of synthesize(company, buildContext(gathered))) {
      markdown += delta;
      yield { type: "delta", text: delta };
    }

    const final = markdown.trim();
    if (!final) {
      yield { type: "error", error: "The dossier came back empty — try again." };
      return;
    }
    yield { type: "done", markdown: final };
  } catch (err) {
    yield { type: "error", error: friendlyGeminiError(err) };
  }
}
