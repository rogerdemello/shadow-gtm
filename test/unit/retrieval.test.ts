import { describe, expect, it } from "vitest";
import { parseFindings } from "../../lib/retrieval";

describe("parseFindings", () => {
  it("parses TITLE :: URL :: snippet lines and strips list prefixes", () => {
    const text = [
      "1. OpenAI raises $122B :: https://example.com/a :: Funding round closed.",
      "- Stripe ships new pricing :: https://example.com/b :: Lower fees.",
    ].join("\n");
    const out = parseFindings(text, 8);
    expect(out).toEqual([
      { title: "OpenAI raises $122B", link: "https://example.com/a", snippet: "Funding round closed." },
      { title: "Stripe ships new pricing", link: "https://example.com/b", snippet: "Lower fees." },
    ]);
  });

  it("skips lines without a valid URL or separator", () => {
    const text = [
      "Here are the findings:", // preamble, no ::
      "No URL here :: just text", // second part isn't a URL
      "Good one :: https://x.com/p :: works",
    ].join("\n");
    const out = parseFindings(text, 8);
    expect(out).toHaveLength(1);
    expect(out[0].link).toBe("https://x.com/p");
  });

  it("tolerates a missing snippet", () => {
    const out = parseFindings("Title only :: https://x.com/p", 8);
    expect(out).toEqual([{ title: "Title only", link: "https://x.com/p", snippet: "" }]);
  });

  it("respects the limit", () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `T${i} :: https://x.com/${i} :: s`,
    ).join("\n");
    expect(parseFindings(lines, 3)).toHaveLength(3);
  });
});
