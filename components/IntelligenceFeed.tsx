"use client";

import type { Signal } from "@/lib/types";
import { timeAgo } from "@/lib/ui";
import { ImpactDot, ScorePill, SignalTag } from "./bits";

export default function IntelligenceFeed({
  signals,
  scanningName,
}: {
  signals: Signal[];
  scanningName: string | null;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-ink-500/60 bg-ink-800/60">
      <div className="flex items-center justify-between border-b border-ink-500/60 px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          🚨 Live intelligence feed
        </h2>
        <span className="font-mono text-[11px] text-slate-500">
          {signals.length} signals
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {scanningName && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-xs text-accent">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-accent" />
            Scanning {scanningName}…
          </div>
        )}

        {signals.length === 0 && !scanningName && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-slate-600">
            <span className="text-2xl">📡</span>
            No signals yet. Add competitors and run an intelligence scan.
          </div>
        )}

        {signals.map((s) => (
          <article
            key={s.id}
            className="animate-fadeUp rounded-lg border border-ink-500/50 bg-ink-700/40 p-3"
          >
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
              <SignalTag type={s.type} />
              <span className="text-sm font-semibold text-slate-100">
                {s.companyName}
              </span>
              <ImpactDot impact={s.impact} />
              <span className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[10px] text-slate-500">
                  {timeAgo(s.createdAt)}
                </span>
                <ScorePill score={s.opportunityScore} />
              </span>
            </header>

            <p className="text-sm text-slate-200">{s.description}</p>

            <div className="mt-2 rounded-md border-l-2 border-accent/50 bg-ink-900/40 px-2.5 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent/80">
                why it matters
              </span>
              <p className="mt-0.5 text-[13px] leading-snug text-slate-300">
                {s.reasoning}
              </p>
            </div>

            <div className="mt-2 flex items-start gap-2 text-[13px]">
              <span aria-hidden className="mt-px text-signal-low">
                ▸
              </span>
              <p className="text-slate-300">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  play:{" "}
                </span>
                {s.recommendedAction}
              </p>
            </div>

            {s.sourceUrl && (
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block max-w-full truncate font-mono text-[10px] text-slate-600 hover:text-signal-info"
              >
                ↗ {s.sourceUrl}
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
