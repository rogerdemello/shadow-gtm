import type { Impact, SignalType } from "./types";

// Presentation helpers shared across client components.

export const SIGNAL_META: Record<
  SignalType,
  { label: string; glyph: string; color: string }
> = {
  pricing: { label: "PRICING", glyph: "$", color: "#ffb020" },
  product: { label: "PRODUCT", glyph: "◆", color: "#3aa0ff" },
  hiring: { label: "HIRING", glyph: "↑", color: "#3ddc97" },
  sentiment: { label: "SENTIMENT", glyph: "‼", color: "#ff4d5e" },
  funding: { label: "FUNDING", glyph: "€", color: "#b388ff" },
  messaging: { label: "MESSAGING", glyph: "✎", color: "#39d0d8" },
  intent: { label: "INTENT", glyph: "◎", color: "#3ddc97" },
  risk: { label: "RISK", glyph: "⚠", color: "#ff4d5e" },
};

export function impactColor(impact: Impact): string {
  return impact === "high" ? "#ff4d5e" : impact === "medium" ? "#ffb020" : "#3ddc97";
}

export function scoreColor(score: number): string {
  if (score >= 75) return "#3ddc97";
  if (score >= 50) return "#ffb020";
  return "#7a8699";
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
