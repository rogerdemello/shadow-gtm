import { defineConfig } from "vitest/config";

// Unit tests run in a Node environment (the code under test is server-side:
// env parsing, HTML→text, the scan diff primitive, store helpers). E2E lives
// separately under Playwright (see Phase 0 of the plan).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    globals: true,
  },
});
