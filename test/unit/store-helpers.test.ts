import { describe, expect, it } from "vitest";
import { normalizeDomain, hash, id } from "../../lib/store";

describe("normalizeDomain", () => {
  it("strips protocol, trailing slashes, and lowercases", () => {
    expect(normalizeDomain("HTTPS://Example.com/")).toBe("example.com");
    expect(normalizeDomain("http://foo.io///")).toBe("foo.io");
    expect(normalizeDomain("  Bar.AI  ")).toBe("bar.ai");
  });

  it("leaves a bare domain untouched", () => {
    expect(normalizeDomain("acme.com")).toBe("acme.com");
  });
});

describe("hash", () => {
  it("is deterministic and 16 hex chars", () => {
    const a = hash("same input");
    const b = hash("same input");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs for different input", () => {
    expect(hash("a")).not.toBe(hash("b"));
  });
});

describe("id", () => {
  it("returns a unique uuid each call", () => {
    expect(id()).not.toBe(id());
    expect(id()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
