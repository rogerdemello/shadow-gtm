"use client";

import { CHART } from "./theme";

// Dependency-free SVG sparkline. Used in the competitor matrix where many tiny
// charts render at once — a full Recharts instance per row would be wasteful.

export default function Sparkline({
  values,
  width = 64,
  height = 18,
  color = CHART.accent,
  max = 100,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Upper bound for the y-axis (opportunity scores cap at 100). */
  max?: number;
}) {
  if (values.length === 0) {
    return <span className="font-mono text-[10px] text-slate-700">—</span>;
  }

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const top = Math.max(max, ...values) || 1;
  const n = values.length;

  // A single point can't draw a line — render a dot.
  const x = (i: number) =>
    pad + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => pad + h - (v / top) * h;

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values[n - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`trend, latest ${last}`}
      className="overflow-visible"
    >
      {n > 1 && (
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(" ")}
        />
      )}
      <circle cx={x(n - 1)} cy={y(last)} r={1.75} fill={color} />
    </svg>
  );
}
