import type { Impact, SignalType } from "@/lib/types";
import { SIGNAL_META, impactColor, scoreColor } from "@/lib/ui";

export function SignalTag({ type }: { type: SignalType }) {
  const m = SIGNAL_META[type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider"
      style={{ color: m.color, background: `${m.color}1a` }}
    >
      <span aria-hidden>{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function ImpactDot({ impact }: { impact: Impact }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: impactColor(impact), boxShadow: `0 0 8px ${impactColor(impact)}` }}
      />
      {impact}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  const c = scoreColor(score);
  return (
    <span
      className="rounded px-2 py-0.5 font-mono text-xs font-bold tabular-nums"
      style={{ color: c, background: `${c}18`, border: `1px solid ${c}44` }}
      title="Opportunity score (0–100)"
    >
      {score}
    </span>
  );
}

export function LiveDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
      <span
        className={`h-2 w-2 rounded-full ${active ? "animate-pulseDot" : ""}`}
        style={{
          background: active ? "#3ddc97" : "#3a4456",
          boxShadow: active ? "0 0 10px #3ddc97" : "none",
        }}
      />
      <span style={{ color: active ? "#3ddc97" : "#5a6678" }}>
        {active ? "LIVE" : "IDLE"}
      </span>
    </span>
  );
}
