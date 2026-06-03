import { describe, expect, it } from "vitest";
import { categorizeJobError } from "../../lib/jobs";

describe("categorizeJobError", () => {
  const cases: [string, string][] = [
    ["429 Too Many Requests", "rate_limit"],
    ["RESOURCE_EXHAUSTED: quota", "rate_limit"],
    ["Gemini RECITATION blocked output", "recitation"],
    ["socket timeout after 30s", "timeout"],
    ["503 Service Unavailable / overloaded", "upstream"],
    ["fetch failed: ECONNRESET", "upstream"],
    ["company not found", "not_found"],
    ["failed to parse JSON schema", "parse"],
    ["API key invalid / unauthenticated", "auth"],
    ["something totally weird happened", "unknown"],
  ];

  for (const [msg, code] of cases) {
    it(`maps "${msg.slice(0, 28)}…" -> ${code}`, () => {
      expect(categorizeJobError(msg)).toBe(code);
    });
  }
});
