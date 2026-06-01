import { describe, expect, it } from "vitest";
import { getTranslator, resolveLocale, isLocale, defaultLocale } from "../../lib/i18n";

describe("resolveLocale", () => {
  it("accepts a supported locale", () => {
    expect(resolveLocale("en")).toBe("en");
  });
  it("strips region subtags (en-US → en)", () => {
    expect(resolveLocale("en-US")).toBe("en");
  });
  it("falls back to the default for unknown locales", () => {
    expect(resolveLocale("xx")).toBe(defaultLocale);
    expect(resolveLocale(null)).toBe(defaultLocale);
  });
  it("isLocale narrows correctly", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zz")).toBe(false);
  });
});

describe("getTranslator", () => {
  const t = getTranslator("en");
  it("resolves known keys", () => {
    expect(t("landing.cta.primary")).toBe("Start free");
  });
  it("returns the key itself when missing (never throws)", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
  it("interpolates {vars}", () => {
    // Use a known template via a synthetic key fallback: missing key returns key,
    // so test interpolation on a real one by formatting an existing template.
    const out = getTranslator("en")("landing.eyebrow");
    expect(typeof out).toBe("string");
    // Interpolation contract:
    const interp = getTranslator("en");
    expect(interp("{n} items", { n: 3 })).toBe("3 items");
  });
});
