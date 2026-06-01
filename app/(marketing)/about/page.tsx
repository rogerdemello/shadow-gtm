import type { Metadata } from "next";

export const metadata: Metadata = { title: "About — Shadow GTM" };

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-slate-50">About</h1>
      <p className="text-sm leading-relaxed text-slate-400">
        Shadow GTM is autonomous web intelligence for revenue teams. Most tools tell you
        &quot;a competitor raised prices.&quot; Shadow GTM tells you what it means and what to do
        about it — grounded in a verbatim quote from the source.
      </p>
      <p className="text-sm leading-relaxed text-slate-400">
        The whole product runs on one loop: live web data via Bright Data, a diff against the last
        scan, reasoning with Google&apos;s Gemini, and a ranked, explained play. Every claim is
        auditable; every scan compounds a historical data moat.
      </p>
      <p className="text-sm leading-relaxed text-slate-400">
        It is built as a real multi-tenant SaaS — isolated workspaces, roles, autonomous
        monitoring, multi-channel alerting, a public API, and an enterprise governance story.
      </p>
    </div>
  );
}
