"use client";

import Markdown from "./Markdown";

export default function BattlecardModal({
  companyName,
  markdown,
  loading,
  onClose,
}: {
  companyName: string;
  markdown: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-ink-500 bg-ink-800 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-500/60 bg-ink-800 px-5 py-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-accent">
            ⚔ Battlecard · {companyName}
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
          >
            esc ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-10 font-mono text-sm text-accent">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-accent" />
              Generating battlecard from live signals…
            </div>
          ) : markdown ? (
            <Markdown source={markdown} />
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
