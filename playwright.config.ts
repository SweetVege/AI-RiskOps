import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // One worker: every test shares one seeded database and some tests write to it.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // Pages load their data after render; allow slower CI machines more than the 5s default.
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3200/login",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
