import { resolve } from "node:path";
import { availableParallelism } from "os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // As in electron.vite.config.ts, for the renderer's view modules that use shared runtime code.
  resolve: { alias: { "@shared": resolve("src/shared"), "@common": resolve("src/renderer/common") } },
  test: {
    include: ["src/**/*.test.ts", "supabase/**/*.test.ts", "runner/**/*.test.ts", "evals/**/*.test.ts"],
    // Each database test runs Postgres in WebAssembly, and more at once than this runs out of memory on a smaller machine.
    maxWorkers: Math.min(4, availableParallelism()),
    // GitHub's macOS runners are slow enough that starting Postgres or Chrome can pass vitest's defaults.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    globalSetup: ["tests/tempRun.ts"],
    // `pnpm run test` runs the src/main/tools/CdpTab tests on their own after the rest: they drive a real headless Chrome, which
    // stalled for seconds on GitHub's macOS runners while the Postgres tests had every core (issue #145).
  },
});
