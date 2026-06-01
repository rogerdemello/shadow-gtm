import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { signPayload, SIGNATURE_HEADER } from "../../lib/integrations/webhooks";
import { generateApiKey, hashApiKey } from "../../lib/apikey";

describe("webhook signing", () => {
  it("produces a stable HMAC-SHA256 hex matching the documented scheme", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ event: "signals.alert", n: 1 });
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    expect(signPayload(secret, body)).toBe(expected);
    expect(SIGNATURE_HEADER).toBe("x-shadowgtm-signature");
  });

  it("different secrets produce different signatures", () => {
    const body = "{}";
    expect(signPayload("a", body)).not.toBe(signPayload("b", body));
  });
});

describe("api keys", () => {
  it("generates an sk_live_ key with matching hash + prefix", () => {
    const { plaintext, hash, prefix } = generateApiKey();
    expect(plaintext.startsWith("sk_live_")).toBe(true);
    expect(prefix).toBe(plaintext.slice(0, 16));
    expect(hash).toBe(hashApiKey(plaintext));
    expect(hash).toHaveLength(64); // sha256 hex
  });

  it("hashing is deterministic and never returns the plaintext", () => {
    const raw = "sk_live_deadbeef";
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    expect(hashApiKey(raw)).not.toContain(raw);
  });
});
