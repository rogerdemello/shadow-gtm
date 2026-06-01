import { z } from "zod";

// ── Typed environment config ────────────────────────────────────────────────
// One validated, typed view of process.env. Every other module imports from
// here instead of touching process.env directly, so misconfiguration fails with
// a clear message and the set of inputs the app depends on lives in one place.
//
// Server-only: this reads secrets, so never import it into a client component.
//
// Most keys are optional by design — a scan needs only GEMINI_API_KEY (Gemini
// does retrieval + reasoning); Supabase/Stripe/Resend/Sentry/SSO add capability.
// The dashboard shows which providers are live via the *Configured() helpers
// below. Keys that ARE present are still format-validated so a typo surfaces at
// boot, not mid-scan.

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── Google Gemini ──────────────────────────────────────────────────────
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  /** Optional secondary model for extraction fallback (e.g. gemini-2.5-pro). */
  GEMINI_MODEL_FALLBACK: z.string().min(1).optional(),
  /** Max concurrent Gemini calls process-wide (default 2) — smooths rate limits. */
  GEMINI_MAX_CONCURRENCY: z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw === "") return undefined;
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : n;
    }),
  /** Thinking-budget cap in tokens. Empty/undefined → model default; 0 disables. */
  GEMINI_THINKING_BUDGET: z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw === "") return undefined;
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : n;
    }),

  /** Set by Vercel at runtime; switches the JSON store to a writable /tmp dir. */
  VERCEL: z.string().optional(),

  // ── Supabase (Postgres + Auth + Realtime) ────────────────────────────────
  // Public values are also inlined into the client bundle by Next at build; the
  // browser client reads them via process.env directly (see lib/db/browser.ts).
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Server-only secret — full DB access for the background worker; NEVER expose. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** "1" surfaces the "Sign in with SSO" path (set once an SSO provider exists). */
  NEXT_PUBLIC_SSO_ENABLED: z.enum(["0", "1"]).optional(),

  /** Shared secret the cron trigger uses to authorize the worker route. */
  WORKER_SECRET: z.string().min(1).optional(),

  // ── Email (Resend) ─────────────────────────────────────────────────────────
  /** Resend API key. When absent, email is logged-skipped (no-op). */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Verified sender, e.g. "Shadow GTM <alerts@yourdomain.com>". */
  EMAIL_FROM: z.string().min(1).optional(),

  /** Public base URL for links in emails (e.g. https://app.example.com). */
  APP_URL: z.url().optional(),
  /** Deployment region id for data-residency reporting (e.g. "us", "eu"). */
  APP_REGION: z.string().min(1).optional(),

  // ── Billing (Stripe) ─────────────────────────────────────────────────────
  /** Stripe secret key. When absent, billing is disabled (everyone is free). */
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  /** Webhook signing secret (whsec_…) used to verify Stripe events. */
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Stripe Price IDs for the self-serve tiers. */
  STRIPE_PRICE_STARTUP: z.string().min(1).optional(),
  STRIPE_PRICE_GROWTH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

/** Parse + validate process.env once, lazily. Throws a readable error on a bad
 *  value (e.g. a malformed NEXT_PUBLIC_SUPABASE_URL) the first time env is read. */
export function getEnv(): Env {
  if (_env) return _env;
  // Treat an empty-string env var as unset (matches shell/.env semantics where
  // `KEY=` means "no value"). Without this, optional() wouldn't catch "" and a
  // blank URL line (e.g. NEXT_PUBLIC_SUPABASE_URL=) would fail url validation.
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

/** Gemini powers both retrieval (grounding) and reasoning — the one key a scan
 *  needs. When false, the dashboard shows the key is missing and scans can't run. */
export function geminiConfigured(): boolean {
  return Boolean(getEnv().GEMINI_API_KEY);
}

/** True once the Supabase project URL + anon key are present (auth + data layer). */
export function supabaseConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** True once Resend is configured (API key + verified sender). When false, the
 *  email layer no-ops so scans/digests still run keyless. */
export function emailConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.RESEND_API_KEY && e.EMAIL_FROM);
}

/** Best base URL for links in emails. Falls back to APP_URL → localhost. */
export function appUrl(): string {
  return getEnv().APP_URL || "http://localhost:3000";
}

/** True once Stripe is configured. When false, every org is treated as free
 *  and checkout/portal are unavailable (quota still applies via the free plan). */
export function billingConfigured(): boolean {
  return Boolean(getEnv().STRIPE_SECRET_KEY);
}

/** For tests: drop the cached parse so a mutated process.env is re-read. */
export function resetEnvCache(): void {
  _env = null;
}
