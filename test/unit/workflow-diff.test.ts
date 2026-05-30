import { describe, expect, it } from "vitest";
import { diffSummary } from "../../lib/workflow";

describe("diffSummary", () => {
  it("returns null when there is no previous text (first scan)", () => {
    expect(diffSummary("", "anything")).toBeNull();
  });

  it("returns null when nothing changed", () => {
    const text = "Starter $49\nPro $99";
    expect(diffSummary(text, text)).toBeNull();
  });

  it("reports added lines", () => {
    const out = diffSummary("Starter $49", "Starter $49\nPro $99");
    expect(out).toContain("ADDED lines:");
    expect(out).toContain("Pro $99");
    expect(out).not.toContain("REMOVED lines:");
  });

  it("reports removed lines", () => {
    const out = diffSummary("Starter $49\nPro $99", "Starter $49");
    expect(out).toContain("REMOVED lines:");
    expect(out).toContain("Pro $99");
  });

  it("reports both a price hike as removed-old + added-new", () => {
    const out = diffSummary("Starter $49", "Starter $79");
    expect(out).toContain("ADDED lines:");
    expect(out).toContain("Starter $79");
    expect(out).toContain("REMOVED lines:");
    expect(out).toContain("Starter $49");
  });

  it("caps each side at 12 lines", () => {
    const oldText = "";
    const newText = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    // First scan → null; build a real diff instead by changing from one line.
    const base = "anchor";
    const grown = base + "\n" + newText;
    const out = diffSummary(base, grown)!;
    const addedCount = out
      .split("\n")
      .filter((l) => l.startsWith("  line ")).length;
    expect(addedCount).toBeLessThanOrEqual(12);
    expect(oldText).toBe(""); // keep the lint quiet about the illustrative var
  });
});
