"use client";

import { useEffect, useMemo, useState } from "react";
import type { Momentum, SeriesPoint } from "@/lib/trends";
import type { SignalType } from "@/lib/types";
import { SIGNAL_META } from "@/lib/ui";
import { OpportunityTrend, VolumeBars } from "./charts/TrendCharts";

export interface TrendEntry {
  company: { id: string; name: string };
  momentum: Momentum;
  series: SeriesPoint[];
}

const TREND_GLYPH: Record<Momentum["scoreTrend"], { glyph: string; color: string }> = {
  up: { glyph: "▲", color: "#3ddc97" },
  down: { glyph: "▼", color: "#ff4d5e" },
  flat: { glyph: "▬", color: "#7a8699" },
};

export default function TrendsPanel({ trends }: { trends: TrendEntry[] }) {
  // Default to the company with the richest history (most scans, then signals).
  const ranked = useMemo(
    () =>
      [...trends].sort(
        (a, b) =>
          b.series.length - a.series.length ||
          b.momentum.totalSignals - a.momentum.totalSignals,
      ),
    [trends],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the selection valid as trends reload (e.g. after a scan or removal).
  useEffect(() => {
    if (ranked.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !ranked.some((t) => t.company.id === selectedId)) {
      setSelectedId(ranked[0].company.id);
    }
  }, [ranked, selectedId]);

  const selected =
    trends.find((t) => t.company.id === selectedId) ?? ranked[0] ?? null;

  if (trends.length === 0 || !selected) {
    return (
      <Shell>
        <p className="px-1 py-6 text-center text-sm text-slate-600">
          No trend data yet. Run a scan to start building history.
        </p>
      </Shell>
    );
  }

  const { momentum: m, series } = selected;
  const trend = TREND_GLYPH[m.scoreTrend];
  const enoughHistory = series.length >= 2;

  return (
    <Shell
      right={
        <select
          value={selected.company.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-slate-300 outline-none focus:border-accent/60"
          aria-label="Select competitor for trends"
        >
          {ranked.map((t) => (
            <option key={t.company.id} value={t.company.id}>
              {t.company.name}
            </option>
          ))}
        </select>
      }
    >
      {/* Momentum stat row */}
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <MStat label="scans" value={String(m.distinctScans)} />
        <MStat label="signals" value={String(m.totalSignals)} />
        <MStat label="top opp" value={String(m.topOpportunity)} />
        <MStat label="avg opp" value={String(m.avgOpportunity)} />
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-ink-500/60 bg-ink-800/60 px-2.5 py-1"
          style={{ color: trend.color }}
          title={`Latest scan's peak score is trending ${m.scoreTrend}`}
        >
          {trend.glyph} {m.scoreTrend}
        </span>
      </div>

      {enoughHistory ? (
        <>
          <ChartBlock title="Opportunity over time">
            <OpportunityTrend series={series} />
          </ChartBlock>
          <ChartBlock title="Signal volume per scan">
            <VolumeBars series={series} />
          </ChartBlock>
        </>
      ) : (
        <p className="rounded-md border border-ink-500/40 bg-ink-900/40 px-3 py-4 text-center text-xs text-slate-500">
          Only one scan captured so far — run another scan to chart the trend.
        </p>
      )}

      {/* Signal mix by type (across all history) */}
      <div className="mt-3">
        <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Signal mix
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(m.byType) as [SignalType, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
              const meta = SIGNAL_META[type];
              return (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded border border-ink-500/60 px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ color: meta.color }}
                  title={meta.label}
                >
                  <span>{meta.glyph}</span>
                  {meta.label.slice(0, 4)} {count}
                </span>
              );
            })}
          {Object.keys(m.byType).length === 0 && (
            <span className="font-mono text-[10px] text-slate-700">no signals</span>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          📈 Momentum & trends
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h3 className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function MStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-ink-500/60 bg-ink-800/60 px-2.5 py-1">
      <span className="text-slate-500">{label} </span>
      <span className="font-bold text-slate-200">{value}</span>
    </span>
  );
}
