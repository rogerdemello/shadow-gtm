export const metadata = { title: "Data Processing Addendum — Shadow GTM" };

export default function DpaPage() {
  return (
    <>
      <h1>Data Processing Addendum</h1>
      <p className="text-slate-500">Last updated: 2026-06-01 · Template — review with counsel before production use.</p>

      <h2>Roles</h2>
      <p>
        For workspace data you control, you are the data controller and Shadow GTM is the
        processor, processing data only on your documented instructions to provide the Service.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We engage sub-processors for hosting, database/auth, AI inference, web-data retrieval,
        email delivery, and error monitoring. Each is bound by confidentiality and data-protection
        obligations. A current list is available on request.
      </p>

      <h2>Security</h2>
      <p>
        Tenants are isolated at the database layer via row-level security; access is least-
        privilege; secrets are stored server-side only. Every monitored page is fingerprinted
        (URL + content hash + timestamp) for an auditable trail.
      </p>

      <h2>International transfers &amp; residency</h2>
      <p>
        Data is processed in the region of your hosting configuration. Where data crosses borders,
        appropriate safeguards (e.g. SCCs) apply.
      </p>

      <h2>Data subject requests &amp; deletion</h2>
      <p>
        You can fulfill access/portability requests via the in-app export, and erasure via
        workspace deletion, which cascades to all associated records.
      </p>
    </>
  );
}
