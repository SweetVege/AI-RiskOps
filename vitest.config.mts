import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    env: {
      // Port must match tests/test-database.ts.
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable",
      // PGlite is a single session; one pooled connection keeps transaction semantics exact.
      DATABASE_POOL_MAX: "1",
    },
  },
});
