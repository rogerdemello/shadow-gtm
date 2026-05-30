import { describe, expect, it } from "vitest";
import { htmlToText, clip } from "../../lib/html";

describe("htmlToText", () => {
  it("strips scripts and styles entirely", () => {
    const html = "<style>.a{color:red}</style><p>Plan A</p><script>evil()</script>";
    const text = htmlToText(html);
    expect(text).toContain("Plan A");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("evil");
  });

  it("preserves block boundaries as newlines", () => {
    const text = htmlToText("<li>Starter</li><li>Pro</li>");
    expect(text.split("\n")).toEqual(["Starter", "Pro"]);
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToText("<p>A &amp; B</p>")).toBe("A & B");
    expect(htmlToText("<p>&#36;49&#x2014;mo</p>")).toBe("$49—mo");
  });

  it("collapses runs of whitespace", () => {
    expect(htmlToText("<p>  $49     /mo  </p>")).toBe("$49 /mo");
  });

  it("drops out-of-range numeric refs safely", () => {
    expect(htmlToText("<p>x&#9999999999;y</p>")).toBe("xy");
  });
});

describe("clip", () => {
  it("returns text unchanged when under the budget", () => {
    expect(clip("short", 100)).toBe("short");
  });

  it("truncates and marks long text, keeping the start", () => {
    const out = clip("abcdefghij", 4);
    expect(out.startsWith("abcd")).toBe(true);
    expect(out).toContain("[truncated]");
  });
});
