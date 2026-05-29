"use client";

import { useEffect, useState } from "react";
import type { ScanEvidence, Signal } from "@/lib/types";
import { SIGNAL_META } from "@/lib/ui";
import { SignalTag, ScorePill } from "./bits";

export default function EvidenceModal({
  signal,
  onClose,
}: {
  signal: Signal;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<ScanEvidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/evidence?companyId=${encodeURIComponent(signal.companyId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEvidence(d.evidence ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signal.companyId]);

  const meta = SIGNAL_META[signal.type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-ink-500 bg-ink-800 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-500/60 bg-ink-800 px-5 py-3">
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-slate-200">
            🔍 Evidence
            <span className="text-slate-500">· {signal.companyName}</span>
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
          >
            esc ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* The signal itself */}
          <div className="rounded-lg border border-ink-500/60 bg-ink-900/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SignalTag type={signal.type} />
              <ScorePill score={signal.opportunityScore} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                confidence {Math.round(signal.confidence * 100)}%
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-100">
              {signal.description}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-slate-400">
              {signal.reasoning}
            </p>
          </div>

          {/* Provable quote */}
          {signal.quote && (
            <Section title="Verbatim quote — from the source" tint={meta.color}>
              <blockquote
                className="rounded-md border-l-2 bg-ink-900/40 p-3 font-mono text-[13px] italic leading-snug text-slate-200"
                style={{ borderColor: meta.color }}
              >
                “{signal.quote}”
              </blockquote>
              {signal.sourceUrl && (
                <a
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block max-w-full truncate font-mono text-[11px] text-signal-info hover:underline"
                >
                  ↗ {signal.sourceUrl}
                </a>
              )}
            </Section>
          )}

          {loading ? (
            <p className="font-mono text-xs text-slate-500">Loading scan inputs…</p>
          ) : evidence ? (
            <>
              {evidence.changeSummary && (
                <Section title="What changed since the last scan">
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink-500/60 bg-ink-900/40 p-3 font-mono text-[11px] leading-snug text-slate-300">
                    {evidence.changeSummary}
                  </pre>
                </Section>
              )}

              {evidence.sources.length > 0 && (
                <Section title="Pages monitored (Bright Data)">
                  <ul className="space-y-1">
                    {evidence.sources.map((s) => (
                      <li
                        key={s.url}
                        className="flex items-center gap-2 font-mono text-[11px] text-slate-400"
                      >
                        <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                          {s.pageType}
                        </span>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-signal-info hover:underline"
                        >
                          {s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {evidence.serp.length > 0 && (
                <Section title="SERP context (Bright Data)">
                  <ul className="space-y-2">
                    {evidence.serp.slice(0, 5).map((s, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-ink-500/40 bg-ink-900/40 p-2.5"
                      >
                        <a
                          href={s.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[13px] font-semibold text-slate-200 hover:text-signal-info"
                        >
                          {s.title || s.link}
                        </a>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-400">
                          {s.snippet}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            <p className="font-mono text-xs text-slate-500">
              No stored scan inputs for this competitor yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  tint,
  children,
}: {
  title: string;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="mb-1.5 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: tint ?? "#7a8699" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}
