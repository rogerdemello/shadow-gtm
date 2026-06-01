import { defineConfig } from "vitest/config";

// AI extraction evals. Run with: npm run eval
// Offline (no GEMINI_API_KEY) it scores each golden case's sample signals to
// validate the harness; with a key it runs the real model and gates quality.
export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
