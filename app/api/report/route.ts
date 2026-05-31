import { storeOr401 } from "@/lib/store-context";
import { computeMomentum } from "@/lib/trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-file Markdown briefing: watchlist + ranked signals + battlecards.
// What a head of sales would send around as the weekly competitive brief.
export async function GET() {
  const r = await storeOr401();
  if (r.res) return r.res;
  const store = r.store;

  const [companies, signals, evidence] = await Promise.all([
    store.listCompanies(),
    store.listSignals(),
    store.listEvidence(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Shadow GTM — Competitive Intelligence Brief`);
  lines.push(`*Generated ${today} · ${companies.length} competitors · ${signals.length} signals*`);
  lines.push("");
  lines.push(
    `> Powered by live web data via [Bright Data](https://brightdata.com) and reasoning via [Gemini](https://ai.google.dev/gemini-api).`,
  );
  lines.push("");

  if (companies.length === 0) {
    lines.push("_Watchlist is empty._");
    return body(lines.join("\n"));
  }

  // Executive summary — top 5 plays across the whole set.
  const topPlays = [...signals]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);
  if (topPlays.length) {
    lines.push(`## Top plays this cycle`);
    lines.push("");
    topPlays.forEach((s, i) => {
      lines.push(
        `**${i + 1}. ${s.companyName} · [${s.type.toUpperCase()}] · opp ${s.opportunityScore}**`,
      );
      lines.push(`- ${s.description}`);
      lines.push(`- *${s.reasoning}*`);
      lines.push(`- **Play:** ${s.recommendedAction}`);
      lines.push("");
    });
  }

  // Per-competitor detail.
  for (const company of companies) {
    const sig = signals
      .filter((s) => s.companyId === company.id)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
    const ev = evidence.find((e) => e.companyId === company.id);
    const card = await store.getBattlecard(company.id);
    const momentum = computeMomentum(company.id, await store.listSignalHistory(company.id));

    const topScore = sig[0]?.opportunityScore ?? 0;
    lines.push("---");
    lines.push("");
    lines.push(`## ${company.name} · \`${company.domain}\``);
    lines.push(
      `*${sig.length} signal${sig.length === 1 ? "" : "s"}${topScore ? ` · top opportunity score ${topScore}` : ""}*`,
    );
    lines.push("");

    // Momentum (from the append-only signal history — the data moat).
    if (momentum.distinctScans > 0) {
      const arrow =
        momentum.scoreTrend === "up" ? "▲" : momentum.scoreTrend === "down" ? "▼" : "▬";
      lines.push(
        `**Momentum:** ${arrow} opportunity trend · ${momentum.distinctScans} scan${momentum.distinctScans === 1 ? "" : "s"} tracked · ${momentum.pricingChanges} pricing move${momentum.pricingChanges === 1 ? "" : "s"} observed`,
      );
      lines.push("");
    }

    if (ev?.sources?.length) {
      lines.push(`**Pages monitored** (Bright Data):`);
      ev.sources.forEach((s) =>
        lines.push(`- \`${s.pageType}\` — ${s.url}`),
      );
      lines.push("");
    }

    if (ev?.changeSummary) {
      lines.push(`**What changed since last scan:**`);
      lines.push("```");
      lines.push(ev.changeSummary);
      lines.push("```");
      lines.push("");
    }

    if (sig.length === 0) {
      lines.push(`_No signals captured yet._`);
      lines.push("");
    } else {
      lines.push(`### Signals`);
      lines.push("");
      sig.forEach((s, i) => {
        lines.push(
          `**${i + 1}. [${s.type.toUpperCase()}] ${s.description}**`,
        );
        lines.push(
          `- Impact: \`${s.impact}\` · Confidence: ${Math.round(s.confidence * 100)}% · Opportunity: **${s.opportunityScore}**`,
        );
        lines.push(`- *Why it matters:* ${s.reasoning}`);
        lines.push(`- **Play:** ${s.recommendedAction}`);
        if (s.quote) lines.push(`- *Evidence:* "${s.quote}"`);
        if (s.sourceUrl) lines.push(`- Source: ${s.sourceUrl}`);
        lines.push("");
      });
    }

    if (card?.markdown) {
      lines.push(`### Battlecard`);
      lines.push("");
      lines.push(card.markdown);
      lines.push("");
    }
  }

  return body(lines.join("\n"));
}

function body(markdown: string): Response {
  const today = new Date().toISOString().slice(0, 10);
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="shadow-gtm-brief-${today}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
