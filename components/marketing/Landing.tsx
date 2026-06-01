import Link from "next/link";
import MarketingShell from "./MarketingShell";
import { getTranslator } from "@/lib/i18n";

const FEATURES = [
  {
    title: "Live web → ranked plays",
    body: "Gemini reads competitor pages and searches the live web (grounded), diffs every scan, and turns movement into ranked, explained GTM plays — not summaries.",
  },
  {
    title: "Auditable by design",
    body: "Every signal carries a verbatim source quote; every fetched page is fingerprinted (URL + hash + timestamp). The AI can't hand-wave.",
  },
  {
    title: "Autonomous monitoring",
    body: "Schedule scans, get in-app, email, Slack, and webhook alerts the moment a competitor crosses your opportunity threshold.",
  },
  {
    title: "Battlecards & War Room",
    body: "Stream a sales battlecard from live signals in one click, or type an attack directive and get an executable, signal-grounded plan.",
  },
  {
    title: "Trends & data moat",
    body: "Append-only signal history powers momentum charts and benchmarks a tool launched tomorrow simply can't reproduce.",
  },
  {
    title: "Built for teams",
    body: "Multi-tenant workspaces, roles, SSO, usage-based plans, a public REST API, and a GDPR-ready export/erase story.",
  },
];

export default function Landing() {
  const t = getTranslator();
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="py-12 text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
          {t("landing.eyebrow")}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-5xl">
          {t("landing.headline")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400">{t("landing.sub")}</p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-bold text-ink-900 shadow-glow transition hover:brightness-110"
          >
            {t("landing.cta.primary")}
          </Link>
          <Link
            href="/features"
            className="rounded-lg border border-ink-500 px-6 py-3 text-sm font-bold text-slate-200 transition hover:border-accent/50 hover:text-accent"
          >
            {t("landing.cta.secondary")}
          </Link>
        </div>
        <p className="mt-3 font-mono text-[11px] text-slate-600">{t("landing.cta.note")}</p>
      </section>

      {/* The loop */}
      <section className="mx-auto mb-12 max-w-2xl rounded-xl border border-ink-500/60 bg-ink-800/60 p-5 text-center font-mono text-sm text-slate-400">
        live web (Gemini grounding) → diff vs last scan → <span className="text-accent">AI signals + reasoning</span> → ranked play
      </section>

      {/* Features grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-5">
            <h3 className="mb-1.5 font-semibold text-slate-100">{f.title}</h3>
            <p className="text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="mt-12 rounded-xl border border-accent/30 bg-accent/5 p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-50">Stop hand-researching competitors.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Add a watchlist, run a scan, and get a ranked briefing your head of sales can act on today.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-bold text-ink-900 transition hover:brightness-110"
        >
          Create your workspace
        </Link>
      </section>
    </MarketingShell>
  );
}
