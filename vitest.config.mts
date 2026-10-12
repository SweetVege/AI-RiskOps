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
    fileParallelism: false,
    env: {
      // Port must match tests/test-database.ts.
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable",
    },
  },
});
