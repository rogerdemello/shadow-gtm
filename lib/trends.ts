import type { Signal, SignalType } from "./types";

// ── Competitor momentum from signal history ───────────────────────────────────
// Pure functions over the append-only signal history (every scan's signals are
// retained). This is the data moat: trend/velocity that a tool launched
// tomorrow can't reproduce. No DB access — fully unit-testable.

export interface Momentum {
  companyId: string;
  /** Signals across ALL scans in history. */
  totalSignals: number;
  /** Distinct scans this company appears in. */
  distinctScans: number;
  /** How many pricing signals have fired over history (price-move velocity). */
  pricingChanges: number;
  /** Mean opportunity score of the latest scan's signals. */
  avgOpportunity: number;
  /** Highest opportunity score in the latest scan. */
  topOpportunity: number;
  /** Latest scan's top score vs the previous scan's. */
  scoreTrend: "up" | "down" | "flat";
  /** Signal counts by type, across history. */
  byType: Partial<Record<SignalType, number>>;
  firstSeen: string | null;
  lastSeen: string | null;
}

/** Group a company's full signal history into scans, newest scan first. */
function groupByScan(signals: Signal[]): Signal[][] {
  const byScan = new Map<string, Signal[]>();
  for (const s of signals) {
    const key = s.scanId || s.createdAt;
    byScan.set(key, [...(byScan.get(key) ?? []), s]);
  }
  // Order scans by their most recent signal createdAt, newest first.
  return [...byScan.values()].sort(
    (a, b) => latestTs(b).localeCompare(latestTs(a)),
  );
}

const latestTs = (group: Signal[]): string =>
  group.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), "");

const maxScore = (group: Signal[]): number =>
  group.reduce((m, s) => Math.max(m, s.opportunityScore), 0);

/** Compute momentum for one company from its full signal history. */
export function computeMomentum(companyId: string, history: Signal[]): Momentum {
  const mine = history.filter((s) => s.companyId === companyId);
  const scans = groupByScan(mine);
  const latest = scans[0] ?? [];
  const previous = scans[1] ?? [];

  const byType: Partial<Record<SignalType, number>> = {};
  for (const s of mine) byType[s.type] = (byType[s.type] ?? 0) + 1;

  const latestTop = maxScore(latest);
  const prevTop = maxScore(previous);
  const scoreTrend =
    scans.length < 2 || latestTop === prevTop
      ? "flat"
      : latestTop > prevTop
        ? "up"
        : "down";

  const avgOpportunity =
    latest.length === 0
      ? 0
      : Math.round(
          latest.reduce((sum, s) => sum + s.opportunityScore, 0) / latest.length,
        );

  const timestamps = mine.map((s) => s.createdAt).sort();

  return {
    companyId,
    totalSignals: mine.length,
    distinctScans: scans.length,
    pricingChanges: byType.pricing ?? 0,
    avgOpportunity,
    topOpportunity: latestTop,
    scoreTrend,
    byType,
    firstSeen: timestamps[0] ?? null,
    lastSeen: timestamps[timestamps.length - 1] ?? null,
  };
}
