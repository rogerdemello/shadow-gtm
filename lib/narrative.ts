import type { Store } from "./store.supabase";
import { geminiClient, runGemini, friendlyGeminiError, usageOf, withModelFallback } from "./gemini";
import { computeMomentum } from "./trends";

// ── Market-narrative agent ────────────────────────────────────────────────────
// Synthesizes a cross-competitor "state of the market" memo from every tracked
// competitor's momentum + top current signals. Streamed Markdown (no tools).

const SYSTEM = `You are the head of competitive intelligence writing a concise "state of the market" memo for the leadership team. From the per-competitor momentum and top signals provided, write Markdown with:
- **The big picture** — what's happening across the market right now.
- **Who's moving** — the competitors with real momentum and why it matters.
- **Threats** — where we're most exposed.
- **Openings** — the clearest places we can win, and who to hit first.
Ground every point in the supplied momentum + signals. Be specific and executive — no fluff, no preamble; start with the "The big picture" heading.`;

export type NarrativeEvent =
  | { type: "delta"; text: string }
  | { type: "done"; markdown: string; tokensIn: number; tokensOut: number }
  | { type: "error"; error: string };

/** Build the cross-competitor context block (pure-ish; reads the store). */
async function buildMarketContext(store: Store): Promise<string | null> {
  const companies = await store.listCompanies();
  if (companies.length === 0) return null;
  const current = await store.listSignals();

  const blocks = await Promise.all(
    companies.map(async (c) => {
      const m = computeMomentum(c.id, await store.listSignalHistory(c.id));
      const top = current
        .filter((s) => s.companyId === c.id && (s.status ?? "active") !== "dismissed")
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 3)
        .map((s) => `  - [${s.type}, opp ${s.opportunityScore}] ${s.description} — ${s.recommendedAction}`)
        .join("\n");
      return `## ${c.name} (${c.domain})
Momentum: trend ${m.scoreTrend}, ${m.distinctScans} scan(s), ${m.pricingChanges} pricing move(s), top opportunity ${m.topOpportunity}, ${m.totalSignals} signals tracked.
Top signals:\n${top || "  - (none yet)"}`;
    }),
  );
  return blocks.join("\n\n");
}

/** Stream a state-of-the-market memo across the watchlist. */
export async function* streamNarrative(
  store: Store,
  signal?: AbortSignal,
): AsyncGenerator<NarrativeEvent> {
  let markdown = "";
  try {
    const context = await buildMarketContext(store);
    if (!context) {
      yield { type: "error", error: "Add competitors and run a scan first — there's nothing to synthesize yet." };
      return;
    }
    const stream = await withModelFallback(
      (m) =>
        runGemini(() =>
          geminiClient().models.generateContentStream({
            model: m,
            contents: `Competitive landscape (momentum + top signals per competitor):\n\n${context}\n\nWrite the state-of-the-market memo.`,
            config: { systemInstruction: SYSTEM, maxOutputTokens: 4096, abortSignal: signal },
          }),
        ),
      "narrative",
      signal,
    );
    let usage = { tokensIn: 0, tokensOut: 0 };
    for await (const chunk of stream) {
      if (signal?.aborted) return;
      const u = usageOf(chunk);
      if (u.tokensIn || u.tokensOut) usage = u; // cumulative; last wins
      const text = chunk.text;
      if (text) {
        markdown += text;
        yield { type: "delta", text };
      }
    }
    const final = markdown.trim();
    if (!final) {
      yield { type: "error", error: "The memo came back empty — try again." };
      return;
    }
    yield { type: "done", markdown: final, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut };
  } catch (err) {
    yield { type: "error", error: friendlyGeminiError(err) };
  }
}
