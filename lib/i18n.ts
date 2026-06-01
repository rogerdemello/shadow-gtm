// ── Lightweight i18n ─────────────────────────────────────────────────────────
// A dependency-free message layer that makes the app i18n-ready without
// restructuring routes behind a /[locale] segment (a heavier migration we defer
// until a second locale is actually shipped). Strings live in flat catalogs;
// t() resolves a key with {var} interpolation and falls back to the default
// locale, then to the key itself. AI-generated output stays in English for now.

export const defaultLocale = "en";
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

type Messages = Record<string, string>;

const en: Messages = {
  "landing.eyebrow": "Autonomous web intelligence for revenue teams",
  "landing.headline": "Turn the live web into a real-time GTM intelligence layer.",
  "landing.sub":
    "Shadow GTM watches your competitors, reasons over what changes, and hands your team the exact play to run — with a quote from the source to back every claim.",
  "landing.cta.primary": "Start free",
  "landing.cta.secondary": "See features",
  "landing.cta.note": "Free plan · no credit card · explore with one-click demo data",
  "nav.features": "Features",
  "nav.pricing": "Pricing",
  "nav.docs": "Docs",
  "nav.signin": "Sign in",
};

const CATALOGS: Record<Locale, Messages> = { en };

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Normalize an arbitrary locale request to a supported one. */
export function resolveLocale(requested?: string | null): Locale {
  if (isLocale(requested)) return requested;
  // Accept-Language style "en-US" → "en".
  const base = requested?.split("-")[0];
  return isLocale(base) ? base : defaultLocale;
}

export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale] ?? CATALOGS[defaultLocale];
}

/** Build a translator bound to a locale. Interpolates {name} placeholders. */
export function getTranslator(locale: Locale = defaultLocale) {
  const messages = getMessages(locale);
  const fallback = CATALOGS[defaultLocale];
  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = messages[key] ?? fallback[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      k in vars ? String(vars[k]) : `{${k}}`,
    );
  };
}
