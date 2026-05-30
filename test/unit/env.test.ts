import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getEnv,
  isMockMode,
  geminiConfigured,
  brightDataConfigured,
  scrapingBrowserConfigured,
  resetEnvCache,
} from "../../lib/env";

// Snapshot + restore the keys these tests mutate so cases stay isolated.
const KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_THINKING_BUDGET",
  "BRIGHTDATA_API_TOKEN",
  "BRIGHTDATA_BROWSER_WS",
  "SHADOW_GTM_MOCK",
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
    expect(getEnv().GEMINI_MODEL).toBe("gemini-2.5-flash");
  });

  it("applies the default Bright Data zones", () => {
    expect(getEnv().BRIGHTDATA_UNLOCKER_ZONE).toBe("web_unlocker1");
    expect(getEnv().BRIGHTDATA_SERP_ZONE).toBe("serp_api1");
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
  it("mock mode is on when no Bright Data token is present", () => {
    expect(isMockMode()).toBe(true);
    expect(brightDataConfigured()).toBe(false);
  });

  it("live mode when token present and mock flag off", () => {
    process.env.BRIGHTDATA_API_TOKEN = "tok_123";
    resetEnvCache();
    expect(isMockMode()).toBe(false);
    expect(brightDataConfigured()).toBe(true);
  });

  it("SHADOW_GTM_MOCK=1 forces mock even with a token", () => {
    process.env.BRIGHTDATA_API_TOKEN = "tok_123";
    process.env.SHADOW_GTM_MOCK = "1";
    resetEnvCache();
    expect(isMockMode()).toBe(true);
    expect(brightDataConfigured()).toBe(false);
  });

  it("geminiConfigured tracks the key", () => {
    expect(geminiConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "key_123";
    resetEnvCache();
    expect(geminiConfigured()).toBe(true);
  });

  it("scrapingBrowserConfigured needs the WS endpoint and live mode", () => {
    expect(scrapingBrowserConfigured()).toBe(false);
    process.env.BRIGHTDATA_API_TOKEN = "tok_123";
    process.env.BRIGHTDATA_BROWSER_WS = "wss://brd.example.com/cdp";
    resetEnvCache();
    expect(scrapingBrowserConfigured()).toBe(true);
  });
});

describe("validation", () => {
  it("throws a readable error on a malformed BRIGHTDATA_BROWSER_WS", () => {
    process.env.BRIGHTDATA_BROWSER_WS = "not-a-url";
    resetEnvCache();
    expect(() => getEnv()).toThrowError(/Invalid environment configuration/);
  });

  it("treats an empty-string value as unset (KEY= means no value)", () => {
    // Regression: a blank `BRIGHTDATA_BROWSER_WS=` line must not fail url
    // validation — empty string is unset, not an invalid URL.
    process.env.BRIGHTDATA_BROWSER_WS = "";
    resetEnvCache();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().BRIGHTDATA_BROWSER_WS).toBeUndefined();
  });

  it("accepts a valid wss:// scraping-browser endpoint", () => {
    process.env.BRIGHTDATA_BROWSER_WS = "wss://brd.example.com:9222/cdp";
    resetEnvCache();
    expect(getEnv().BRIGHTDATA_BROWSER_WS).toBe("wss://brd.example.com:9222/cdp");
  });
});
