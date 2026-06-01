import { describe, expect, it } from "vitest";
import { GOLDEN, scoreExtraction } from "../../lib/eval";

describe("scoreExtraction", () => {
  it("scores the golden sample signals at 1.0", () => {
    for (const g of GOLDEN) {
      const pagesText = g.pages.map((p) => p.text).join("\n");
      const { score } = scoreExtraction(g.sampleSignals, pagesText, g.expect);
      expect(score).toBe(1);
    }
  });

  it("penalizes a missing expected type", () => {
    const g = GOLDEN[0];
    const text = g.pages.map((p) => p.text).join("\n");
    const wrongType = g.sampleSignals.map((s) => ({ ...s, type: "messaging" as const }));
    const { score } = scoreExtraction(wrongType, text, g.expect);
    expect(score).toBeLessThan(1);
  });

  it("fails the verbatim check for a fabricated quote", () => {
    const g = GOLDEN[0];
    const text = g.pages.map((p) => p.text).join("\n");
    const faked = g.sampleSignals.map((s) => ({ ...s, quote: "this text is not on the page" }));
    const { checks } = scoreExtraction(faked, text, g.expect);
    expect(checks.find((c) => c.name === "quotes-verbatim")?.pass).toBe(false);
  });

  it("returns 0 checks-passed for an empty extraction", () => {
    const g = GOLDEN[0];
    const text = g.pages.map((p) => p.text).join("\n");
    const { score } = scoreExtraction([], text, g.expect);
    expect(score).toBeLessThan(0.5);
  });
});
