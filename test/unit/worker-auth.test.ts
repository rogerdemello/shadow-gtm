import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWorkerRequest } from "../../lib/worker-auth";

const SECRET = "a-sufficiently-long-worker-secret-value";

function reqWith(headers: Record<string, string>, body = "{}"): Request {
  return new Request("http://localhost/api/worker/process", {
    method: "POST",
    headers,
    body,
  });
}

function sign(ts: string, body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

describe("verifyWorkerRequest — static secret mode", () => {
  it("accepts a matching x-worker-secret header", () => {
    expect(verifyWorkerRequest(reqWith({ "x-worker-secret": SECRET }), "{}", SECRET)).toBe(true);
  });
  it("accepts a matching Bearer token", () => {
    expect(
      verifyWorkerRequest(reqWith({ authorization: `Bearer ${SECRET}` }), "{}", SECRET),
    ).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyWorkerRequest(reqWith({ "x-worker-secret": "nope" }), "{}", SECRET)).toBe(false);
  });
  it("rejects a missing secret", () => {
    expect(verifyWorkerRequest(reqWith({}), "{}", SECRET)).toBe(false);
  });
});

describe("verifyWorkerRequest — signed mode", () => {
  it("accepts a fresh, correctly signed request", () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = "{}";
    const req = reqWith({ "x-worker-timestamp": ts, "x-worker-signature": sign(ts, body) }, body);
    expect(verifyWorkerRequest(req, body, SECRET)).toBe(true);
  });
  it("rejects a bad signature", () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const req = reqWith({ "x-worker-timestamp": ts, "x-worker-signature": "deadbeef" });
    expect(verifyWorkerRequest(req, "{}", SECRET)).toBe(false);
  });
  it("rejects a replayed (stale) timestamp outside the 5-min window", () => {
    const ts = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
    const body = "{}";
    const req = reqWith({ "x-worker-timestamp": ts, "x-worker-signature": sign(ts, body) }, body);
    expect(verifyWorkerRequest(req, body, SECRET)).toBe(false);
  });
  it("rejects a signature computed with a different secret", () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = "{}";
    const req = reqWith(
      { "x-worker-timestamp": ts, "x-worker-signature": sign(ts, body, "other-secret") },
      body,
    );
    expect(verifyWorkerRequest(req, body, SECRET)).toBe(false);
  });
});
