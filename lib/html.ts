// Dependency-free HTML → text. Good enough to feed an LLM and to diff pages.
// We strip scripts/styles/nav noise and collapse whitespace.

export function htmlToText(html: string): string {
  let text = html;

  // Drop non-content blocks entirely.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Keep block boundaries as newlines so structure (and prices) survive.
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|section|article|header)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining tags.
  text = text.replace(/<[^>]+>/g, " ");

  // Decode the handful of entities that actually matter for pricing text.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&dollar;/gi, "$");

  // Decode numeric character refs (decimal &#8217; and hex &#x2014;) — common
  // in real pricing pages (curly quotes, dashes, etc).
  text = text
    .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeFromCodePoint(parseInt(n, 16)));

  // Collapse whitespace.
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return text.trim();
}

function safeFromCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/** Trim to a token-friendly size while keeping the start (where pricing lives). */
export function clip(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[truncated]";
}
