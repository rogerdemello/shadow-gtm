"use client";

import { useEffect, useRef } from "react";
import Markdown from "./Markdown";
import CopyButton from "./CopyButton";

const ERROR_PREFIX = "**Error:**";

export default function DossierModal({
  companyName,
  markdown,
  steps,
  loading,
  onClose,
  onRegenerate,
}: {
  companyName: string;
  markdown: string | null;
  /** Agent progress lines (plan → gather per angle → synthesis). */
  steps: string[];
  loading: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !loading) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (dist < 80) el.scrollTop = el.scrollHeight;
  }, [markdown, loading]);

  const empty = !markdown;
  const isError = !!markdown && markdown.startsWith(ERROR_PREFIX);
  const showCopy = !loading && !!markdown && !isError;
  // Before any synthesis text arrives, show the agent's step log.
  const showSteps = loading && empty && steps.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Deep-dive dossier for ${companyName}`}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-signal-info/40 bg-ink-800 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-500/60 bg-ink-800 px-5 py-3">
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-signal-info">
            🔬 Deep dive · {companyName}
            {loading && (
              <span className="flex items-center gap-1 text-[10px] text-signal-info/70">
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-signal-info" />
                researching
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1.5">
            {showCopy && <CopyButton text={markdown!} />}
            {!loading && onRegenerate && !empty && (
              <button
                onClick={onRegenerate}
                className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition hover:border-signal-info/50 hover:text-signal-info"
                title="Re-run the research agent"
              >
                ↻ rerun
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close dossier"
              className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
            >
              esc ✕
            </button>
          </div>
        </div>

        {/* Agent progress log (shown while gathering, before synthesis text) */}
        {steps.length > 0 && (
          <div className="border-b border-ink-500/40 px-5 py-2">
            <ul className="space-y-0.5 font-mono text-[11px] text-slate-500">
              {steps.map((s, i) => (
                <li key={i}>
                  <span className="text-signal-info/70">▸</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {showSteps ? (
            <div className="flex items-center gap-2 py-6 font-mono text-sm text-signal-info">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-signal-info" />
              The agent is researching {companyName} across the web…
            </div>
          ) : markdown ? (
            <>
              <Markdown source={markdown} />
              {loading && (
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulseDot bg-signal-info align-baseline" />
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">No dossier yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
