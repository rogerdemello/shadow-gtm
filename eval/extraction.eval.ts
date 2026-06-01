import { describe, expect, it } from "vitest";
import { GOLDEN, scoreExtraction } from "../lib/eval";
import { extractSignals, geminiConfigured } from "../lib/ai";

// Extraction quality gate. With GEMINI_API_KEY set, runs the real model on each
// golden page set and scores it; without a key, scores the case's sampleSignals
// so the harness + scorer stay verifiable offline. Run: npm run eval
const THRESHOLD = 0.8;

describe("extraction eval", () => {
  const live = geminiConfigured();
  it(`runs ${live ? "LIVE (Gemini)" : "offline (sample signals)"} on ${GOLDEN.length} cases`, () => {
    expect(GOLDEN.length).toBeGreaterThan(0);
  });

  for (const g of GOLDEN) {
    it(`${g.name} scores >= ${THRESHOLD}`, async () => {
      const pagesText = g.pages.map((p) => p.text).join("\n");

      const signals = live
        ? (
            await extractSignals({
              company: {
                id: "eval",
                name: g.company.name,
                domain: g.company.domain,
                pricingUrl: g.pages[0].url,
                createdAt: "2026-06-01T00:00:00Z",
              },
              pages: g.pages,
              serp: [],
              changeSummary: null,
              scanId: "eval",
            })
          ).signals
        : g.sampleSignals;

      const { score, checks } = scoreExtraction(signals, pagesText, g.expect);
      if (score < THRESHOLD) {
        // eslint-disable-next-line no-console
        console.log(`[eval] ${g.name} failing checks:`, checks.filter((c) => !c.pass));
      }
      expect(score).toBeGreaterThanOrEqual(THRESHOLD);
    }, 60_000);
  }
});
