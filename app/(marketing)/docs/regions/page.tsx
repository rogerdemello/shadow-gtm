import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data residency & i18n — Shadow GTM" };

export default function DocsRegionsPage() {
  return (
    <>
      <h1>Data residency &amp; internationalization</h1>

      <h2>Where your data lives</h2>
      <p>
        Workspace data is stored in the region of the deployment&apos;s database. The active region
        is configured with <code>APP_REGION</code> and reported in the DPA. Because no region is
        hardcoded in application logic, an EU deployment is a matter of provisioning the database
        and worker in-region.
      </p>

      <h2>Multi-region strategy</h2>
      <p>
        For global scale, run a database per residency zone (e.g. US and EU Supabase projects) and
        route tenants by their configured region. The scan worker runs in the Node runtime close to
        its database. Read replicas can serve dashboard reads with low latency while writes stay in
        the primary. This is an infrastructure choice made at deploy time — the app is built to
        accommodate it rather than assuming a single region.
      </p>

      <h2>Internationalization</h2>
      <p>
        The UI is wired through a message catalog (<code>lib/i18n.ts</code>) with{" "}
        <code>{"{var}"}</code> interpolation and a default-locale fallback, so adding a locale is a
        matter of supplying a catalog. Locale-prefixed routing is deferred until a second locale
        ships. AI-generated intelligence is produced in English today; a locale-aware prompt is a
        future enhancement.
      </p>
    </>
  );
}
