"use client";

import { useMemo, useState } from "react";
import type { Signal, SignalStatus, SignalType } from "@/lib/types";
import { SIGNAL_META, timeAgo } from "@/lib/ui";
import { ImpactDot, ScorePill, SignalTag } from "./bits";

const statusOf = (s: Signal): SignalStatus => s.status ?? "active";

function StatusBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded border border-ink-500 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 opacity-0 transition hover:border-accent/50 hover:text-accent group-hover:opacity-100"
    >
      {label}
    </button>
  );
}

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
  onSetStatus,
  onFeedback,
}: {
  signals: Signal[];
  scanningName: string | null;
  onEvidence: (signal: Signal) => void;
  onSetStatus?: (signalId: string, status: SignalStatus) => void;
  /** Rate a signal's usefulness: 1 (useful), -1 (noise), 0 (clear). */
  onFeedback?: (signalId: string, feedback: number) => void;
}) {
  const [active, setActive] = useState<Set<SignalType>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const present = useMemo(() => {
    const s = new Set<SignalType>();
    for (const sig of signals) s.add(sig.type);
    return s;
  }, [signals]);

  const dismissedCount = useMemo(
    () => signals.filter((s) => statusOf(s) === "dismissed").length,
    [signals],
  );

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (!showDismissed && statusOf(s) === "dismissed") return false;
      if (active.size > 0 && !active.has(s.type)) return false;
      return true;
    });
  }, [signals, active, showDismissed]);

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
          {dismissedCount > 0 && (
            <button
              onClick={() => setShowDismissed((v) => !v)}
              className="ml-auto rounded-full border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
            >
              {showDismissed ? "hide" : "show"} dismissed ({dismissedCount})
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
              No signals yet. Add a competitor on the left, then hit{" "}
              <span className="font-mono text-accent/80">▶ Run intelligence scan</span> —
              Gemini reads the live web and the feed fills in.
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
            className={`group animate-fadeUp cursor-pointer rounded-lg border p-3 transition hover:bg-ink-700/60 ${
              statusOf(s) === "dismissed"
                ? "border-ink-500/40 bg-ink-700/20 opacity-50"
                : statusOf(s) === "handled"
                  ? "border-accent/30 bg-ink-700/40"
                  : "border-ink-500/50 bg-ink-700/40 hover:border-accent/40"
            }`}
            title="Click for evidence — verbatim quote and source"
          >
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
              <SignalTag type={s.type} />
              <span className="text-sm font-semibold text-slate-100">
                {s.companyName}
              </span>
              {statusOf(s) === "handled" && (
                <span className="rounded bg-accent/15 px-1 font-mono text-[9px] font-bold uppercase text-accent">
                  ✓ handled
                </span>
              )}
              {statusOf(s) === "dismissed" && (
                <span className="rounded bg-ink-900/60 px-1 font-mono text-[9px] font-bold uppercase text-slate-500">
                  dismissed
                </span>
              )}
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
              {onFeedback && (
                <span className={`flex items-center gap-1 ${onSetStatus ? "ml-auto" : "ml-auto"}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFeedback(s.id, s.feedback === 1 ? 0 : 1);
                    }}
                    title="Useful signal"
                    aria-pressed={s.feedback === 1}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                      s.feedback === 1
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-ink-500 text-slate-500 opacity-0 hover:text-accent group-hover:opacity-100"
                    }`}
                  >
                    👍
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFeedback(s.id, s.feedback === -1 ? 0 : -1);
                    }}
                    title="Noise — not useful"
                    aria-pressed={s.feedback === -1}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                      s.feedback === -1
                        ? "border-signal-high/60 bg-signal-high/10 text-signal-high"
                        : "border-ink-500 text-slate-500 opacity-0 hover:text-signal-high group-hover:opacity-100"
                    }`}
                  >
                    👎
                  </button>
                </span>
              )}
              {onSetStatus && (
                <span className={`flex items-center gap-1 ${onFeedback ? "" : "ml-auto"}`}>
                  {statusOf(s) !== "handled" && (
                    <StatusBtn
                      label="✓ handled"
                      title="Mark this signal handled"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetStatus(s.id, "handled");
                      }}
                    />
                  )}
                  {statusOf(s) !== "dismissed" ? (
                    <StatusBtn
                      label="✕ dismiss"
                      title="Dismiss this signal"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetStatus(s.id, "dismissed");
                      }}
                    />
                  ) : (
                    <StatusBtn
                      label="↺ restore"
                      title="Restore to active"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetStatus(s.id, "active");
                      }}
                    />
                  )}
                </span>
              )}
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
