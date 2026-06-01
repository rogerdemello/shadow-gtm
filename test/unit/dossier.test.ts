import { describe, expect, it } from "vitest";
import { buildContext } from "../../lib/dossier";

describe("buildContext", () => {
  it("formats findings into numbered, cited blocks per dimension", () => {
    const ctx = buildContext([
      {
        dimension: "Funding & financials",
        results: [
          { title: "Raised $50M", link: "https://x.com/a", snippet: "Series B." },
          { title: "Profitable", link: "https://x.com/b", snippet: "Cash-flow positive." },
        ],
      },
    ]);
    expect(ctx).toContain("## Funding & financials");
    expect(ctx).toContain("[1] Raised $50M");
    expect(ctx).toContain("https://x.com/a");
    expect(ctx).toContain("[2] Profitable");
  });

  it("marks dimensions with no findings", () => {
    const ctx = buildContext([{ dimension: "Sentiment", results: [] }]);
    expect(ctx).toContain("## Sentiment");
    expect(ctx).toContain("(no findings)");
  });

  it("joins multiple dimensions", () => {
    const ctx = buildContext([
      { dimension: "A", results: [{ title: "t", link: "https://x/1", snippet: "s" }] },
      { dimension: "B", results: [] },
    ]);
    expect(ctx).toContain("## A");
    expect(ctx).toContain("## B");
  });
});
