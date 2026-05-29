"use client";

import { useState } from "react";

// Tiny copy-to-clipboard button. Falls back to a no-op if navigator.clipboard
// is unavailable (older browsers / non-secure context); never throws.

export default function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Older browsers — fall back to a textarea hack so we always succeed.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        // Give up silently.
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      onClick={onCopy}
      disabled={!text}
      className={
        className ??
        "rounded border border-ink-500 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition hover:border-accent/50 hover:text-accent disabled:opacity-30"
      }
      title="Copy to clipboard"
    >
      {copied ? "✓ copied" : label}
    </button>
  );
}
