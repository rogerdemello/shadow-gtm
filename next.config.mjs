/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // puppeteer-core (Bright Data Scraping Browser client) must stay external —
  // it's a Node library that shouldn't be bundled into the server build.
  serverExternalPackages: ["puppeteer-core"],
};

export default nextConfig;
