"use client";

import React from "react";

// Minimal, XSS-safe Markdown rendering (headings, bullets, bold) — no raw HTML
// injection, so model output can never inject markup.
function renderInline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return <code key={i}>{p.slice(1, -1)}</code>;
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </React.Fragment>
  );
}

function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let k = 0;

  const flush = () => {
    if (list.length) {
      const items = [...list];
      blocks.push(
        <ul key={k++}>
          {items.map((li, i) => (
            <li key={i}>{renderInline(li, i)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{2,3}\s/.test(line)) {
      flush();
      const txt = line.replace(/^#{2,3}\s/, "");
      blocks.push(<h3 key={k++}>{renderInline(txt, 0)}</h3>);
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(<p key={k++}>{renderInline(line, 0)}</p>);
    }
  }
  flush();
  return <div className="markdown text-sm text-slate-300">{blocks}</div>;
}

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
