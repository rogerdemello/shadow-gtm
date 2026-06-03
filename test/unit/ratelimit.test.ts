import { describe, expect, it } from "vitest";
import { hit } from "../../lib/ratelimit";

describe("hit (fixed-window limiter)", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `t1-${Math.round(performance.now())}`;
    expect(hit(key, 3, 60_000).allowed).toBe(true);
    expect(hit(key, 3, 60_000).allowed).toBe(true);
    const third = hit(key, 3, 60_000);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(hit(key, 3, 60_000).allowed).toBe(false);
  });

  it("reports remaining and reset", () => {
    const key = `t2-${Math.round(performance.now())}`;
    const r = hit(key, 10, 60_000);
    expect(r.remaining).toBe(9);
    expect(r.limit).toBe(10);
    expect(r.resetMs).toBeGreaterThan(0);
    expect(r.resetMs).toBeLessThanOrEqual(60_000);
  });

  it("resets after the window elapses", async () => {
    const key = `t3-${Math.round(performance.now())}`;
    expect(hit(key, 1, 20).allowed).toBe(true);
    expect(hit(key, 1, 20).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(hit(key, 1, 20).allowed).toBe(true); // new window
  });

  it("isolates separate keys", () => {
    const a = `t4a-${Math.round(performance.now())}`;
    const b = `t4b-${Math.round(performance.now())}`;
    expect(hit(a, 1, 60_000).allowed).toBe(true);
    expect(hit(a, 1, 60_000).allowed).toBe(false);
    expect(hit(b, 1, 60_000).allowed).toBe(true); // independent bucket
  });
});
