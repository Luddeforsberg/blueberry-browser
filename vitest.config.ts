import { resolve } from "node:path";
import { availableParallelism } from "os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // As in electron.vite.config.ts, for the renderer's view modules that use shared runtime code.
  resolve: { alias: { "@shared": resolve("src/shared") } },
  test: {
    include: ["src/**/*.test.ts", "supabase/**/*.test.ts", "runner/**/*.test.ts", "evals/**/*.test.ts"],
    // Each database test runs Postgres in WebAssembly, and more at once than this runs out of memory on a smaller machine.
    maxWorkers: Math.min(4, availableParallelism()),
  },
});
