"use client";

import type { Signal } from "@/lib/types";
import { ScorePill, SignalTag } from "./bits";

export default function Recommendations({ signals }: { signals: Signal[] }) {
  const top = [...signals]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-accent/25 bg-gradient-to-b from-accent/5 to-transparent p-4">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-accent/90">
        🧠 AI recommended plays
      </h2>

      {top.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ranked plays appear here after a scan.
        </p>
      ) : (
        <ol className="space-y-2">
          {top.map((s, i) => (
            <li
              key={s.id}
              className="flex gap-3 rounded-lg border border-ink-500/50 bg-ink-800/60 p-2.5"
            >
              <span className="font-mono text-lg font-bold tabular-nums text-accent/70">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {s.companyName}
                  </span>
                  <SignalTag type={s.type} />
                  <span className="ml-auto">
                    <ScorePill score={s.opportunityScore} />
                  </span>
                </div>
                <p className="text-[13px] leading-snug text-slate-300">
                  {s.recommendedAction}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
