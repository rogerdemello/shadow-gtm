// Conservative security headers applied to every response. (A strict CSP is
// intentionally omitted — Next's inline runtime needs careful nonce handling;
// tracked for a later hardening pass.)
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // puppeteer-core (Bright Data Scraping Browser client) must stay external —
  // it's a Node library that shouldn't be bundled into the server build.
  serverExternalPackages: ["puppeteer-core"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
