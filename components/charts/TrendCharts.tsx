"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/trends";
import { CHART, shortDate, TOOLTIP_STYLE } from "./theme";

type Row = SeriesPoint & { label: string };

function toRows(series: SeriesPoint[]): Row[] {
  return series.map((p) => ({ ...p, label: shortDate(p.date) }));
}

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.text, fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

/** Opportunity score over time — top (peak) and average per scan. */
export function OpportunityTrend({ series }: { series: SeriesPoint[] }) {
  const rows = toRows(series);
  const last = rows[rows.length - 1];
  const label = last
    ? `Opportunity score over ${rows.length} scans. Latest peak ${last.topOpportunity}, average ${last.avgOpportunity}.`
    : "Opportunity score over time (no data yet).";
  return (
    <div role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: CHART.text }}
          cursor={{ stroke: CHART.grid }}
        />
        <Line
          type="monotone"
          dataKey="topOpportunity"
          name="peak"
          stroke={CHART.accent}
          strokeWidth={2}
          dot={{ r: 2, fill: CHART.accent }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avgOpportunity"
          name="avg"
          stroke={CHART.mid}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}

/** Signal volume per scan. */
export function VolumeBars({ series }: { series: SeriesPoint[] }) {
  const rows = toRows(series);
  const last = rows[rows.length - 1];
  const label = last
    ? `Signals per scan over ${rows.length} scans. Latest ${last.count}.`
    : "Signal volume per scan (no data yet).";
  return (
    <div role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: CHART.text }}
          cursor={{ fill: CHART.grid, opacity: 0.3 }}
        />
        <Bar dataKey="count" name="signals" fill={CHART.bar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
