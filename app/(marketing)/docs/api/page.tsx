import type { Metadata } from "next";

export const metadata: Metadata = { title: "API reference — Shadow GTM" };

export default function DocsApiPage() {
  return (
    <>
      <h1>API reference</h1>
      <p>
        The public REST API is read-only and scoped to your workspace. Create a key in{" "}
        <code>Settings → Integrations → API keys</code> (shown once) and send it as a bearer token.
      </p>

      <h2>Authentication</h2>
      <pre>{`Authorization: Bearer sk_live_xxxxxxxxxxxx`}</pre>
      <p>Requests are metered per workspace. Revoke a key anytime in Settings.</p>

      <h2>GET /api/v1/companies</h2>
      <p>Your watchlist.</p>
      <pre>{`curl https://YOUR_APP/api/v1/companies \\
  -H "Authorization: Bearer $SHADOW_GTM_KEY"

{ "data": [ { "id": "...", "name": "Acme", "domain": "acme.com", ... } ] }`}</pre>

      <h2>GET /api/v1/signals</h2>
      <p>
        Current signals, newest first. Optional <code>?companyId=</code> to filter.
      </p>
      <pre>{`curl "https://YOUR_APP/api/v1/signals?companyId=COMPANY_ID" \\
  -H "Authorization: Bearer $SHADOW_GTM_KEY"`}</pre>

      <h2>GET /api/v1/trends</h2>
      <p>Per-competitor momentum + time series from the append-only signal history.</p>
      <pre>{`{ "data": [ { "company": {...}, "momentum": {...}, "series": [...] } ] }`}</pre>

      <h2>Webhooks</h2>
      <p>
        Register an outbound endpoint in Settings to receive a signed POST on new high-opportunity
        signals. Verify the <code>x-shadowgtm-signature</code> header (HMAC-SHA256 of the raw body
        with your endpoint secret).
      </p>
      <pre>{`const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
// compare to req.headers["x-shadowgtm-signature"]`}</pre>
    </>
  );
}
