import type { Metadata } from "next";

export const metadata: Metadata = { title: "Features — Shadow GTM" };

const SECTIONS = [
  {
    h: "Live competitive monitoring",
    p: "Add competitors by name + domain. Each scan reads their pricing page and homepage via Gemini's URL-context tool and pulls news/reviews/hiring/intent through Google Search grounding — real, cited, live web data with just a Gemini key.",
  },
  {
    h: "Reasoned signals, not summaries",
    p: "Gemini extracts discrete, typed, scored signals (pricing, product, hiring, sentiment, funding, messaging, intent, risk) and explains the second-order implication and the play to run — in one structured pass.",
  },
  {
    h: "Auditable evidence",
    p: "Every signal carries a verbatim quote from the source. Every fetched page is fingerprinted with a content hash + timestamp, browsable in an immutable audit trail.",
  },
  {
    h: "Autonomous scans + alerts",
    p: "Schedule hourly/daily/weekly scans. Get notified in-app (realtime), by email, in Slack, or via signed outbound webhooks when a signal crosses your opportunity threshold.",
  },
  {
    h: "Battlecards & War Room",
    p: "Stream a Markdown sales battlecard from a competitor's live signals, or type an attack directive and get a full, signal-grounded campaign plan.",
  },
  {
    h: "Trends & momentum",
    p: "Append-only signal history powers opportunity-over-time charts, per-competitor momentum, and a data moat that compounds with every scan.",
  },
  {
    h: "Platform & governance",
    p: "Multi-tenant workspaces with row-level isolation, roles + invitations, SSO/SAML, tiered plans with usage quotas, a public REST API, data export, and one-click workspace deletion.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-50">Features</h1>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.h} className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-5">
            <h2 className="mb-1 text-lg font-semibold text-slate-100">{s.h}</h2>
            <p className="text-sm text-slate-400">{s.p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
