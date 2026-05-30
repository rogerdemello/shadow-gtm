import { z } from "zod";

// ── Typed environment config ────────────────────────────────────────────────
// One validated, typed view of process.env. Every other module imports from
// here instead of touching process.env directly, so misconfiguration fails with
// a clear message and the set of inputs the app depends on lives in one place.
//
// Server-only: this reads secrets, so never import it into a client component.
//
// Most keys are optional by design — the app runs in "mock mode" (synthetic
// pages + SERP) when the Bright Data token is absent, and the dashboard shows
// which providers are live via the *Configured() helpers below. Keys that ARE
// present are still format-validated so a typo surfaces at boot, not mid-scan.

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── Google Gemini ──────────────────────────────────────────────────────
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  /** Thinking-budget cap in tokens. Empty/undefined → model default; 0 disables. */
  GEMINI_THINKING_BUDGET: z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw === "") return undefined;
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : n;
    }),

  // ── Bright Data ──────────────────────────────────────────────────────────
  BRIGHTDATA_API_TOKEN: z.string().min(1).optional(),
  BRIGHTDATA_UNLOCKER_ZONE: z.string().min(1).default("web_unlocker1"),
  BRIGHTDATA_SERP_ZONE: z.string().min(1).default("serp_api1"),
  /** Scraping Browser CDP endpoint (wss://…) — required only for renderJs sites. */
  BRIGHTDATA_BROWSER_WS: z.url().optional(),

  /** "1" forces synthetic pages/SERP — offline UI work without spending credits. */
  SHADOW_GTM_MOCK: z.enum(["0", "1"]).optional(),

  /** Set by Vercel at runtime; switches the JSON store to a writable /tmp dir. */
  VERCEL: z.string().optional(),

  // ── Supabase (Postgres + Auth + Realtime) ────────────────────────────────
  // Public values are also inlined into the client bundle by Next at build; the
  // browser client reads them via process.env directly (see lib/db/browser.ts).
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Server-only secret — full DB access for the background worker; NEVER expose. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

/** Parse + validate process.env once, lazily. Throws a readable error on a bad
 *  value (e.g. a malformed BRIGHTDATA_BROWSER_WS url) the first time env is read. */
export function getEnv(): Env {
  if (_env) return _env;
  // Treat an empty-string env var as unset (matches shell/.env semantics where
  // `KEY=` means "no value"). Without this, optional() wouldn't catch "" and a
  // blank BRIGHTDATA_BROWSER_WS= line would fail url validation at boot.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    cleaned[k] = v === "" ? undefined : v;
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return (_env = parsed.data);
}

/** Convenience proxy so callers can write `env.GEMINI_MODEL`. */
export const env: Env = new Proxy({} as Env, {
  get: (_t, key: string) => getEnv()[key as keyof Env],
});

// ── Provider-status helpers (single source of truth for the UI pills) ────────

/** Mock mode is on when explicitly set OR when no Bright Data token is present. */
export function isMockMode(): boolean {
  const e = getEnv();
  return e.SHADOW_GTM_MOCK === "1" || !e.BRIGHTDATA_API_TOKEN;
}

export function geminiConfigured(): boolean {
  return Boolean(getEnv().GEMINI_API_KEY);
}

export function brightDataConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.BRIGHTDATA_API_TOKEN) && e.SHADOW_GTM_MOCK !== "1";
}

export function scrapingBrowserConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.BRIGHTDATA_BROWSER_WS) && e.SHADOW_GTM_MOCK !== "1";
}

/** True once the Supabase project URL + anon key are present (auth + data layer). */
export function supabaseConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** For tests: drop the cached parse so a mutated process.env is re-read. */
export function resetEnvCache(): void {
  _env = null;
}
