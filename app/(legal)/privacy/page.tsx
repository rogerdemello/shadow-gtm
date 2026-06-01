export const metadata = { title: "Privacy Policy — Shadow GTM" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-slate-500">Last updated: 2026-06-01 · Template — review with counsel before production use.</p>

      <h2>What we collect</h2>
      <p>
        Account data (your email and workspace membership), the competitors you choose to monitor,
        the public web content we fetch on your behalf, AI-generated signals derived from it, and
        usage metadata for billing and reliability.
      </p>

      <h2>How we use it</h2>
      <p>
        To provide the Service: run scans, generate intelligence, send the alerts you enable, meter
        usage, and improve reliability. We do not sell your data.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We rely on infrastructure and AI providers (e.g. our database/auth host, the model
        provider, our web-data and email providers) strictly to operate the Service. See the{" "}
        <a href="/dpa" className="text-accent">DPA</a> for details.
      </p>

      <h2>Retention &amp; your rights</h2>
      <p>
        Signal history is retained to power trend analysis until you delete it. You can export your
        full workspace data or permanently delete your workspace at any time from Settings →
        Organization. Deletion cascades to all associated data.
      </p>

      <h2>Contact</h2>
      <p>For privacy requests, contact your workspace owner or our support address.</p>
    </>
  );
}
