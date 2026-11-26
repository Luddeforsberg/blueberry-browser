import { defineConfig } from "@playwright/test";

// The README's pictures, taken from the founder's profile with the real model, so they spend real money and depend on
// real websites. Each step builds on the one before, in the same profile.
export default defineConfig({
  testDir: ".",
  testMatch: "pictures.spec.ts",
  outputDir: "../../test-results/pictures-run",
  retries: 0,
  workers: 1,
  timeout: 10 * 60_000,
  // The first launch of a run reads Electron from disk, which can take longer than a launch may.
  globalSetup: "../../tests/warmUp.ts",
  reporter: "list",
});
