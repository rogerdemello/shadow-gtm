import { defineConfig } from "vitest/config";

// Integration tests hit the LIVE Supabase project (keys read from .env.local in
// the test). Kept separate from the unit config so CI — which has no keys —
// never runs them. Run locally with: npx vitest run --config vitest.integration.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.int.test.ts"],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
