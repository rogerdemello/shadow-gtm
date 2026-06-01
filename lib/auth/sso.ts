// ── SSO (SAML/OIDC via Supabase Auth) ────────────────────────────────────────
// Supabase resolves an email *domain* to a registered SSO provider. Enterprise
// orgs register their IdP (Okta/Entra/etc.) against their domain; users then
// sign in with SSO instead of a password. Enabling the UI is gated by the public
// NEXT_PUBLIC_SSO_ENABLED flag (set once the project has an SSO provider).

/** Whether to surface the SSO sign-in path (read client- or server-side). */
export function ssoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SSO_ENABLED === "1";
}

/** Extract the email domain used to route to an IdP. */
export function domainFromEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes(".") ? domain : null;
}
