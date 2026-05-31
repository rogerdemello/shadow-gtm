import { describe, expect, it } from "vitest";
import { computeMomentum } from "../../lib/trends";
import type { Signal, SignalType } from "../../lib/types";

let seq = 0;
function sig(
  partial: Partial<Signal> & { scanId: string; createdAt: string; type?: SignalType; opp?: number },
): Signal {
  return {
    id: `s${seq++}`,
    companyId: "c1",
    companyName: "Acme",
    scanId: partial.scanId,
    type: partial.type ?? "pricing",
    description: "d",
    impact: "high",
    confidence: 0.9,
    opportunityScore: partial.opp ?? 50,
    reasoning: "r",
    recommendedAction: "a",
    sourceUrl: "u",
    createdAt: partial.createdAt,
  };
}

describe("computeMomentum", () => {
  it("returns an empty momentum for no history", () => {
    const m = computeMomentum("c1", []);
    expect(m.totalSignals).toBe(0);
    expect(m.distinctScans).toBe(0);
    expect(m.scoreTrend).toBe("flat");
    expect(m.topOpportunity).toBe(0);
  });

  it("counts totals, distinct scans, and pricing changes across history", () => {
    const history: Signal[] = [
      sig({ scanId: "scan1", createdAt: "2026-05-01T00:00:00Z", type: "pricing", opp: 60 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", type: "pricing", opp: 70 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", type: "hiring", opp: 40 }),
      sig({ scanId: "scan3", createdAt: "2026-05-15T00:00:00Z", type: "pricing", opp: 85 }),
    ];
    const m = computeMomentum("c1", history);
    expect(m.totalSignals).toBe(4);
    expect(m.distinctScans).toBe(3);
    expect(m.pricingChanges).toBe(3);
    expect(m.byType.pricing).toBe(3);
    expect(m.byType.hiring).toBe(1);
    expect(m.firstSeen).toBe("2026-05-01T00:00:00Z");
    expect(m.lastSeen).toBe("2026-05-15T00:00:00Z");
  });

  it("detects an upward score trend (latest scan top > previous)", () => {
    const m = computeMomentum("c1", [
      sig({ scanId: "scan1", createdAt: "2026-05-01T00:00:00Z", opp: 50 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", opp: 80 }),
    ]);
    expect(m.scoreTrend).toBe("up");
    expect(m.topOpportunity).toBe(80);
  });

  it("detects a downward trend", () => {
    const m = computeMomentum("c1", [
      sig({ scanId: "scan1", createdAt: "2026-05-01T00:00:00Z", opp: 90 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", opp: 55 }),
    ]);
    expect(m.scoreTrend).toBe("down");
  });

  it("averages only the latest scan's signals", () => {
    const m = computeMomentum("c1", [
      sig({ scanId: "scan1", createdAt: "2026-05-01T00:00:00Z", opp: 10 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", opp: 60 }),
      sig({ scanId: "scan2", createdAt: "2026-05-08T00:00:00Z", opp: 80 }),
    ]);
    expect(m.avgOpportunity).toBe(70); // (60+80)/2, scan1 excluded
  });

  it("ignores other companies' signals", () => {
    const m = computeMomentum("c1", [
      sig({ scanId: "scan1", createdAt: "2026-05-01T00:00:00Z", opp: 50 }),
      { ...sig({ scanId: "scanX", createdAt: "2026-05-09T00:00:00Z", opp: 99 }), companyId: "other" },
    ]);
    expect(m.totalSignals).toBe(1);
    expect(m.topOpportunity).toBe(50);
  });
});
