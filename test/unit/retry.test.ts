import { describe, expect, it, vi } from "vitest";
import { withRetry, isTransient } from "../../lib/retry";

describe("withRetry", () => {
  it("returns immediately on success (one attempt)", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 server error"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after `attempts` and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 server error"));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("503 server error");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when shouldRetry returns false (fail fast)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 unauthorized"));
    await expect(
      withRetry(fn, { baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow("401 unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isTransient", () => {
  it("retries timeouts and 5xx", () => {
    expect(isTransient(new Error("request timed out after 60000ms"))).toBe(true);
    expect(isTransient(new Error("Bright Data 503 on zone"))).toBe(true);
    expect(isTransient(new Error("socket hang up"))).toBe(true);
  });

  it("does not retry 4xx client errors", () => {
    expect(isTransient(new Error("401 unauthorized"))).toBe(false);
    expect(isTransient(new Error("400 bad request"))).toBe(false);
    expect(isTransient(new Error("not found"))).toBe(false);
  });

  it("retries 429 rate limits despite being 4xx", () => {
    expect(isTransient(new Error("429 too many requests"))).toBe(true);
    expect(isTransient(new Error("rate limit exceeded"))).toBe(true);
  });
});
