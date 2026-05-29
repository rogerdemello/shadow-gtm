"use client";

import { useMemo, useState } from "react";
import type { Signal, SignalType } from "@/lib/types";
import { SIGNAL_META, timeAgo } from "@/lib/ui";
import { ImpactDot, ScorePill, SignalTag } from "./bits";

const ALL_TYPES = [
  "pricing",
  "product",
  "hiring",
  "sentiment",
  "funding",
  "messaging",
  "intent",
  "risk",
] as const satisfies readonly SignalType[];

export default function IntelligenceFeed({
  signals,
  scanningName,
  onEvidence,
}: {
  signals: Signal[];
  scanningName: string | null;
  onEvidence: (signal: Signal) => void;
}) {
  const [active, setActive] = useState<Set<SignalType>>(new Set());

  const present = useMemo(() => {
    const s = new Set<SignalType>();
    for (const sig of signals) s.add(sig.type);
    return s;
  }, [signals]);

  const filtered = useMemo(() => {
    if (active.size === 0) return signals;
    return signals.filter((s) => active.has(s.type));
  }, [signals, active]);

  const toggle = (t: SignalType) => {
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const showFilters = signals.length > 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-ink-500/60 bg-ink-800/60">
      <div className="flex items-center justify-between border-b border-ink-500/60 px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          🚨 Live intelligence feed
        </h2>
        <span className="font-mono text-[11px] text-slate-500">
          {filtered.length}
          {active.size > 0 && (
            <span className="text-slate-600"> / {signals.length}</span>
          )}{" "}
          signals
        </span>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-500/40 px-3 py-2">
          {ALL_TYPES.filter((t) => present.has(t)).map((t) => {
            const on = active.has(t);
            const meta = SIGNAL_META[t];
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition"
                style={{
                  color: on ? "#0a0e14" : meta.color,
                  background: on ? meta.color : `${meta.color}14`,
                  borderColor: on ? meta.color : `${meta.color}44`,
                }}
              >
                {meta.glyph} {meta.label}
              </button>
            );
          })}
          {active.size > 0 && (
            <button
              onClick={() => setActive(new Set())}
              className="rounded-full border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
            >
              clear
            </button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {scanningName && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-xs text-accent">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-accent" />
            Scanning {scanningName}…
          </div>
        )}

        {signals.length === 0 && !scanningName && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600">
            <span className="text-3xl">📡</span>
            <p>
              No signals yet. Add competitors and run an intelligence scan —
              or hit <span className="font-mono text-accent/80">✦ Try with demo data</span> in
              the header to see a populated feed.
            </p>
          </div>
        )}

        {filtered.length === 0 && signals.length > 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-600">
            No signals match the active filter.
          </p>
        )}

        {filtered.map((s) => (
          <article
            key={s.id}
            onClick={() => onEvidence(s)}
            className="group animate-fadeUp cursor-pointer rounded-lg border border-ink-500/50 bg-ink-700/40 p-3 transition hover:border-accent/40 hover:bg-ink-700/60"
            title="Click for evidence — verbatim quote and source"
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

            <footer className="mt-2 flex items-center gap-2 text-[10px]">
              {s.quote && (
                <span className="rounded bg-ink-900/50 px-1.5 py-0.5 font-mono text-slate-500">
                  ❝ evidence
                </span>
              )}
              {s.sourceUrl && (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block max-w-full truncate font-mono text-[10px] text-slate-600 hover:text-signal-info"
                >
                  ↗ {s.sourceUrl}
                </a>
              )}
              <span className="ml-auto font-mono text-[10px] text-slate-600 opacity-0 transition group-hover:opacity-100">
                show evidence →
              </span>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
