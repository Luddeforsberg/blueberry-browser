import { defineConfig } from "@playwright/test";

// Separate from the end-to-end tests, because these spend real money and depend on real websites.
export default defineConfig({
  testDir: ".",
  testMatch: "run.spec.ts",
  outputDir: "../test-results/evals",
  retries: 0,
  workers: 1,
  reporter: "list",
});
