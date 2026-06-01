import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs — Shadow GTM" };

export default function DocsOverviewPage() {
  return (
    <>
      <h1>Getting started</h1>
      <p>
        Shadow GTM turns competitor web movement into ranked, explained GTM plays. This guide walks
        the core loop.
      </p>

      <h2>1. Build your watchlist</h2>
      <p>
        Add competitors by name + domain on the dashboard. Mark a competitor &quot;JS-heavy&quot; to
        render it through Bright Data&apos;s Scraping Browser. Your plan sets how many competitors
        you can track.
      </p>

      <h2>2. Run an intelligence scan</h2>
      <p>
        Hit <code>Run intelligence scan</code>. For each competitor we fetch the pricing page +
        homepage, pull live search signals, diff against the last scan, and ask Gemini to extract
        scored, reasoned signals. Results stream into the feed live.
      </p>

      <h2>3. Act on the intelligence</h2>
      <p>
        Open any signal to see its verbatim source quote and the exact pages we monitored. Generate
        a streaming battlecard, or open the War Room and type an attack directive for a full plan.
      </p>

      <h2>4. Automate it</h2>
      <p>
        In Settings, schedule recurring scans and choose alert channels (in-app, email, Slack,
        webhook) plus an opportunity threshold. The weekly digest emails your team the top plays.
      </p>

      <h2>5. Govern it</h2>
      <p>
        Invite teammates with roles, manage your plan + usage, connect integrations, mint API keys,
        browse the immutable audit trail, and export or delete your workspace data — all under
        Settings.
      </p>
    </>
  );
}
