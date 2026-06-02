import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getEnv,
  geminiConfigured,
  supabaseConfigured,
  emailConfigured,
  resetEnvCache,
} from "../../lib/env";

// Snapshot + restore the keys these tests mutate so cases stay isolated.
const KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_THINKING_BUDGET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetEnvCache();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
});

describe("getEnv defaults", () => {
  it("applies the default Gemini model", () => {
    expect(getEnv().GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
  });
});

describe("GEMINI_THINKING_BUDGET transform", () => {
  it("is undefined when unset", () => {
    expect(getEnv().GEMINI_THINKING_BUDGET).toBeUndefined();
  });

  it("parses 0 (thinking disabled)", () => {
    process.env.GEMINI_THINKING_BUDGET = "0";
    resetEnvCache();
    expect(getEnv().GEMINI_THINKING_BUDGET).toBe(0);
  });

  it("parses a positive cap", () => {
    process.env.GEMINI_THINKING_BUDGET = "2048";
    resetEnvCache();
    expect(getEnv().GEMINI_THINKING_BUDGET).toBe(2048);
  });

  it("falls back to undefined on garbage", () => {
    process.env.GEMINI_THINKING_BUDGET = "abc";
    resetEnvCache();
    expect(getEnv().GEMINI_THINKING_BUDGET).toBeUndefined();
  });
});

describe("provider-status helpers", () => {
  it("geminiConfigured tracks the key", () => {
    expect(geminiConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "key_123";
    resetEnvCache();
    expect(geminiConfigured()).toBe(true);
  });

  it("supabaseConfigured needs URL + anon key", () => {
    expect(supabaseConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_123";
    resetEnvCache();
    expect(supabaseConfigured()).toBe(true);
  });

  it("emailConfigured needs API key + sender", () => {
    expect(emailConfigured()).toBe(false);
    process.env.RESEND_API_KEY = "re_123";
    process.env.EMAIL_FROM = "Shadow GTM <alerts@x.com>";
    resetEnvCache();
    expect(emailConfigured()).toBe(true);
  });
});

describe("validation", () => {
  it("throws a readable error on a malformed URL var", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    resetEnvCache();
    expect(() => getEnv()).toThrowError(/Invalid environment configuration/);
  });

  it("treats an empty-string value as unset (KEY= means no value)", () => {
    // Regression: a blank `NEXT_PUBLIC_SUPABASE_URL=` line must not fail url
    // validation — empty string is unset, not an invalid URL.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    resetEnvCache();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("accepts a valid https URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    resetEnvCache();
    expect(getEnv().NEXT_PUBLIC_SUPABASE_URL).toBe("https://proj.supabase.co");
  });
});
