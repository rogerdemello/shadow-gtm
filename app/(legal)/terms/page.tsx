export const metadata = { title: "Terms of Service — Shadow GTM" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-slate-500">Last updated: 2026-06-01 · Template — review with counsel before production use.</p>

      <h2>1. Acceptance</h2>
      <p>
        By creating a workspace or using Shadow GTM (the &quot;Service&quot;), you agree to these
        Terms. If you use the Service on behalf of an organization, you represent that you are
        authorized to bind it.
      </p>

      <h2>2. The Service</h2>
      <p>
        Shadow GTM monitors publicly available web data about competitors you choose to track and
        applies AI to surface go-to-market intelligence. You are responsible for the competitors
        you add and for using the output lawfully.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        Do not use the Service to violate any law, infringe third-party rights, scrape sources you
        are not permitted to access, or attempt to disrupt the Service or other tenants.
      </p>

      <h2>4. Plans &amp; billing</h2>
      <p>
        Paid plans are billed in advance via our payment processor. Quotas apply per plan. Fees are
        non-refundable except where required by law.
      </p>

      <h2>5. Data</h2>
      <p>
        Your workspace data is handled per our <a href="/privacy" className="text-accent">Privacy Policy</a> and{" "}
        <a href="/dpa" className="text-accent">Data Processing Addendum</a>. You may export or delete
        your data at any time from Settings.
      </p>

      <h2>6. Disclaimer &amp; liability</h2>
      <p>
        The Service is provided &quot;as is.&quot; AI-generated intelligence may be incomplete or
        inaccurate; verify before acting. To the maximum extent permitted by law, our liability is
        limited to the fees you paid in the preceding three months.
      </p>

      <h2>7. Changes</h2>
      <p>We may update these Terms; material changes will be notified in-app or by email.</p>
    </>
  );
}
