import type { Metadata } from "next";

export const metadata: Metadata = { title: "SSO setup — Shadow GTM" };

export default function DocsSsoPage() {
  return (
    <>
      <h1>SSO / SAML setup</h1>
      <p>
        Enterprise workspaces can sign in through their own identity provider (Okta, Entra ID,
        Google Workspace, …) via SAML 2.0, using Supabase Auth&apos;s SSO.
      </p>

      <h2>1. Register your IdP</h2>
      <p>
        Provide your provider&apos;s metadata URL/XML and map your email domain (e.g.{" "}
        <code>acme.com</code>) to the SSO connection. This is configured once per project by an
        administrator.
      </p>

      <h2>2. Enable the sign-in path</h2>
      <p>
        Set <code>NEXT_PUBLIC_SSO_ENABLED=1</code> so the &quot;Sign in with SSO&quot; button
        appears on the login screen.
      </p>

      <h2>3. Sign in</h2>
      <p>
        Users enter their work email; Shadow GTM routes the email&apos;s domain to your IdP and
        completes the SAML handshake. New users are provisioned a profile automatically on first
        sign-in.
      </p>

      <h2>Notes</h2>
      <p>
        SSO enforcement (disabling password login for your domain) is an Enterprise plan capability.
        Contact sales to enable it for your organization.
      </p>
    </>
  );
}
