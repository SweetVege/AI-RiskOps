import { expect, test } from "@playwright/test";
import { demoUrl, openPage, sidebar, trackPageErrors } from "./helpers";

const pages = [
  { label: "Overview", slug: "overview", heading: "Risk Level Trend" },
  { label: "Risk Analytics", slug: "analytics", heading: "Application Drivers" },
  { label: "Risk Events", slug: "risk-events", heading: "Risk Event Workbench" },
  { label: "Call Logs", slug: "call-logs", heading: "Linked Risk Event" },
  { label: "Applications", slug: "applications", heading: "Application Risk Inventory" },
  { label: "Policy Center", slug: "policy", heading: "Rule Library" },
  { label: "Application Setup", slug: "setup", heading: "Integration Credentials" },
  { label: "User Access", slug: "access", heading: "Recent Access Changes" },
];

test.describe("demo mode", () => {
  test("shows seeded overview metrics without signing in", async ({ page }) => {
    const assertNoErrors = trackPageErrors(page);

    const summaryResponse = page.waitForResponse((response) => response.url().includes("/api/overview/summary"));

    await page.goto(demoUrl);

    const summary = (await (await summaryResponse).json()).data;

    // Other tests ingest calls into the shared database, so compare against what the API returned.
    expect(summary.modelCallsToday).toBeGreaterThanOrEqual(5004);
    await expect(page.getByText("Public demo mode: read-only.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI Application Risk Overview" })).toBeVisible();
    await expect(page.getByText(String(summary.modelCallsToday), { exact: true })).toBeVisible();
    await expect(page.getByText(String(summary.riskEvents), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top Risky Applications" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    assertNoErrors();
  });

  test("opens every page from the sidebar and updates the URL", async ({ page }) => {
    const assertNoErrors = trackPageErrors(page);

    await page.goto(demoUrl);

    for (const target of pages) {
      await openPage(page, target.label);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`page=${target.slug}`));
    }

    assertNoErrors();
  });

  test("renders a deep link on first load without hydration errors", async ({ page }) => {
    const assertNoErrors = trackPageErrors(page);

    for (const target of pages) {
      await page.goto(`${demoUrl}/?page=${target.slug}`);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
    }

    assertNoErrors();
  });

  test("switching to App Owner hides admin pages and narrows data", async ({ page }) => {
    await page.goto(`${demoUrl}/?page=applications`);
    await expect(page.getByRole("button", { name: /Finance Approval Agent/ }).first()).toBeVisible();

    await page.locator("header select").selectOption("App Owner");

    await expect(sidebar(page).getByRole("button", { name: "Policy Center" })).toHaveCount(0);
    await expect(page.getByText("Assigned Apps: 3")).toBeVisible();
    await expect(page.getByRole("button", { name: /Customer Support Copilot/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Finance Approval Agent/ })).toHaveCount(0);
  });

  test("applies risk event filters from the URL and from the controls", async ({ page }) => {
    const filtered = page.waitForResponse((response) => /\/api\/risk-events\?.*level=severe/.test(response.url()));

    await page.goto(`${demoUrl}/?page=risk-events&level=severe`);
    expect((await (await filtered).json()).pagination.totalItems).toBeGreaterThanOrEqual(292);

    const blocked = page.waitForResponse((response) => /\/api\/risk-events\?.*action=block/.test(response.url()));

    await page.locator("select").filter({ hasText: "All Actions" }).selectOption("block");
    expect((await (await blocked).json()).data.every((event: { action: string }) => event.action === "block")).toBe(true);
    await expect(page).toHaveURL(/action=block/);
    await expect(page.getByRole("heading", { name: "Matched Rules & Evidence" })).toBeVisible();
  });

  test("rejects writes with a read-only message", async ({ page }) => {
    await page.goto(`${demoUrl}/?page=policy`);
    await expect(page.getByRole("heading", { name: "Rule Library" })).toBeVisible();

    const toggle = page.waitForResponse((response) => response.url().includes("/toggle") && response.request().method() === "POST");

    await page.getByRole("button", { name: "Enabled", exact: true }).first().click();
    expect((await toggle).status()).toBe(403);
    await expect(page.getByText("Demo mode is read-only.")).toBeVisible();
  });
});
