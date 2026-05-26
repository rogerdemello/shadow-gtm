"use client";

import React from "react";

// Minimal, XSS-safe Markdown rendering (headings, bullets, bold, inline code).
// No raw HTML injection, so model output can never inject markup.

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

export default function Markdown({ source }: { source: string }) {
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
      blocks.push(<h3 key={k++}>{renderInline(line.replace(/^#{2,3}\s/, ""), 0)}</h3>);
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
