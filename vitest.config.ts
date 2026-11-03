import { availableParallelism } from "os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "supabase/**/*.test.ts", "runner/**/*.test.ts"],
    // Each database test runs Postgres in WebAssembly, and more at once than this runs out of memory on a smaller machine.
    maxWorkers: Math.min(4, availableParallelism()),
  },
});
