import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/tempRun.ts",
  reporter: process.env.CI ? "github" : "list",
});
