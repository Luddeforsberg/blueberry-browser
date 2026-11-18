import { defineConfig } from "@playwright/test";

// `pnpm run drive` and `pnpm run baseline` run through Playwright, for its TypeScript and its workers. Only
// shots.drive.ts runs here, and the end-to-end tests never pick it up.
export default defineConfig({
  testDir: ".",
  testMatch: "shots.drive.ts",
  // Every picture is its own launch, so they spread over the workers.
  fullyParallel: true,
  retries: 0,
  workers: Number(process.env.BLUEBERRY_DRIVE_WORKERS) || 1,
  timeout: 90_000,
  reporter: [["line"]],
  globalTeardown: "./manifest.ts",
});
