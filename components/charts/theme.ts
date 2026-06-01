// Shared chart palette + styling so every chart matches the terminal aesthetic.
// Mirrors the tokens in tailwind.config.ts / lib/ui.ts (kept as literals because
// Recharts needs real color strings, not Tailwind classes).

export const CHART = {
  accent: "#3ddc97",
  grid: "#252e3d", // ink-500
  axis: "#5a6678",
  text: "#7a8699",
  bar: "#3aa0ff", // signal-info
  high: "#ff4d5e",
  mid: "#ffb020",
} as const;

/** Recharts <Tooltip> contentStyle that matches the dark panels. */
export const TOOLTIP_STYLE = {
  background: "#0a0e14", // ink-800
  border: "1px solid #252e3d",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  color: "#e2e8f0",
} as const;

/** Short, locale-independent date label (e.g. "May 8") for chart axes. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
