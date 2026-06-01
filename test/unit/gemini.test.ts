import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runGemini, inFlight, friendlyGeminiError } from "../../lib/gemini";
import { resetEnvCache } from "../../lib/env";

describe("runGemini concurrency limiter", () => {
  let savedMax: string | undefined;
  beforeAll(() => {
    savedMax = process.env.GEMINI_MAX_CONCURRENCY;
    process.env.GEMINI_MAX_CONCURRENCY = "2";
    resetEnvCache();
  });
  afterAll(() => {
    if (savedMax === undefined) delete process.env.GEMINI_MAX_CONCURRENCY;
    else process.env.GEMINI_MAX_CONCURRENCY = savedMax;
    resetEnvCache();
  });

  it("never runs more than the configured max at once", async () => {
    let peak = 0;
    const task = () =>
      runGemini(async () => {
        peak = Math.max(peak, inFlight());
        await new Promise((r) => setTimeout(r, 15));
        return true;
      });
    const results = await Promise.all(Array.from({ length: 8 }, task));
    expect(results).toHaveLength(8);
    expect(results.every(Boolean)).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(inFlight()).toBe(0); // all released
  });

  it("releases the slot even when the task throws", async () => {
    await expect(
      runGemini(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(inFlight()).toBe(0);
  });
});

describe("friendlyGeminiError", () => {
  it("maps quota/429 to a rate-limit message", () => {
    const msg = friendlyGeminiError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'));
    expect(msg).toMatch(/rate limit/i);
  });
  it("maps RECITATION", () => {
    expect(friendlyGeminiError(new Error("blocked: RECITATION"))).toMatch(/recitation/i);
  });
  it("maps API key errors", () => {
    expect(friendlyGeminiError(new Error("API key not valid"))).toMatch(/key/i);
  });
  it("extracts the message field from a JSON error", () => {
    expect(friendlyGeminiError(new Error('{"error":{"message":"bad input"}}'))).toBe("bad input");
  });
});
