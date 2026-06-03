import { describe, expect, it } from "vitest";
import { idempotencyKey, replayIdempotent, rememberIdempotent } from "../../lib/idempotency";

function reqWith(key?: string): Request {
  return new Request("http://localhost/api/companies", {
    method: "POST",
    headers: key ? { "idempotency-key": key } : {},
  });
}

describe("idempotencyKey", () => {
  it("reads + trims the header, null when absent", () => {
    expect(idempotencyKey(reqWith("abc"))).toBe("abc");
    expect(idempotencyKey(reqWith())).toBeNull();
  });
  it("rejects an over-long key", () => {
    expect(idempotencyKey(reqWith("x".repeat(201)))).toBeNull();
  });
});

describe("replay / remember", () => {
  it("first-seen returns null, replay returns the remembered response", async () => {
    const key = `k-${Math.round(performance.now())}`;
    expect(replayIdempotent("companies", key)).toBeNull();
    rememberIdempotent("companies", key, 201, { company: { id: "c1" } });
    const r = replayIdempotent("companies", key);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(201);
    expect(r!.headers.get("Idempotent-Replay")).toBe("true");
    expect(await r!.json()).toEqual({ company: { id: "c1" } });
  });
  it("scopes by route — same key on another route is independent", () => {
    const key = `k2-${Math.round(performance.now())}`;
    rememberIdempotent("companies", key, 201, { a: 1 });
    expect(replayIdempotent("webhooks", key)).toBeNull();
  });
  it("a null key never caches or replays", () => {
    rememberIdempotent("companies", null, 201, { a: 1 });
    expect(replayIdempotent("companies", null)).toBeNull();
  });
});
