"use client";

import React from "react";

// Minimal, XSS-safe Markdown rendering: headings, bullets, ordered lists, bold,
// inline code, code fences, and http(s) links. No raw HTML injection — links
// only accept http(s) URLs, so model output can never inject a javascript: href.

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Inline: **bold**, `code`, and [text](url) for http(s) URLs only.
const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, key: number): React.ReactNode {
  const parts = text.split(INLINE_RE);
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return <code key={i}>{p.slice(1, -1)}</code>;
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
        if (link && isSafeUrl(link[2])) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noreferrer"
              className="text-signal-info underline decoration-signal-info/40 hover:decoration-signal-info"
            >
              {link[1]}
            </a>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </React.Fragment>
  );
}

type ListMode = "ul" | "ol" | null;

export default function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let listMode: ListMode = null;
  let fence: string[] | null = null;
  let k = 0;

  const flushList = () => {
    if (!list.length) return;
    const items = list.map((li, i) => <li key={i}>{renderInline(li, i)}</li>);
    blocks.push(
      listMode === "ol" ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>,
    );
    list = [];
    listMode = null;
  };

  const flushFence = () => {
    if (!fence) return;
    blocks.push(
      <pre key={k++}>
        <code>{fence.join("\n")}</code>
      </pre>,
    );
    fence = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Code fence boundary — swallows the marker, captures everything between.
    if (/^```/.test(line)) {
      if (fence) {
        flushFence();
      } else {
        flushList();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(raw);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2], 0);
      blocks.push(
        level === 1 ? (
          <h2 key={k++}>{content}</h2>
        ) : level === 2 ? (
          <h3 key={k++}>{content}</h3>
        ) : (
          <h4 key={k++}>{content}</h4>
        ),
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listMode === "ol") flushList();
      listMode = "ul";
      list.push(bullet[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (listMode === "ul") flushList();
      listMode = "ol";
      list.push(ordered[1]);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    blocks.push(<p key={k++}>{renderInline(line, 0)}</p>);
  }
  flushFence();
  flushList();

  return <div className="markdown text-sm text-slate-300">{blocks}</div>;
}
