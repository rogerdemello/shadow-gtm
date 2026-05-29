"use client";

import { useEffect, useRef } from "react";
import Markdown from "./Markdown";
import CopyButton from "./CopyButton";

const ERROR_PREFIX = "**Error:**";

export default function BattlecardModal({
  companyName,
  markdown,
  loading,
  onClose,
  onRegenerate,
}: {
  companyName: string;
  markdown: string | null;
  loading: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest tokens in view while streaming, but don't fight the user
  // if they've scrolled up — only auto-scroll when they're at/near the bottom.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !loading) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (dist < 80) el.scrollTop = el.scrollHeight;
  }, [markdown, loading]);

  const empty = !markdown;
  const isError = !!markdown && markdown.startsWith(ERROR_PREFIX);
  const showCopy = !loading && !!markdown && !isError;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-ink-500 bg-ink-800 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-500/60 bg-ink-800 px-5 py-3">
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent">
            ⚔ Battlecard · {companyName}
            {loading && (
              <span className="flex items-center gap-1 text-[10px] text-accent/70">
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-accent" />
                streaming
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1.5">
            {showCopy && <CopyButton text={markdown!} />}
            {!loading && onRegenerate && !empty && (
              <button
                onClick={onRegenerate}
                className="rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition hover:border-accent/50 hover:text-accent"
                title="Re-run from the latest signals"
              >
                ↻ regen
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
            >
              esc ✕
            </button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {loading && empty ? (
            <div className="flex items-center gap-2 py-10 font-mono text-sm text-accent">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-accent" />
              Drafting battlecard from live signals…
            </div>
          ) : markdown ? (
            <>
              <Markdown source={markdown} />
              {loading && (
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulseDot bg-accent align-baseline" />
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              No battlecard yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
