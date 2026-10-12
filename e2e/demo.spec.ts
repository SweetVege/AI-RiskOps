import { expect, test } from "@playwright/test";
import { demoUrl, openPage, sidebar, trackPageErrors } from "./helpers";

const pages = [
  { label: "Overview", route: "/", heading: "Risk Level Trend" },
  { label: "Risk Analytics", route: "/analytics", heading: "Application Drivers" },
  { label: "Risk Events", route: "/risk-events", heading: "Risk Event Workbench" },
  { label: "Call Logs", route: "/call-logs", heading: "Linked Risk Event" },
  { label: "Applications", route: "/applications", heading: "Application Risk Inventory" },
  { label: "Policy Center", route: "/admin/policy", heading: "Rule Library" },
  { label: "Application Setup", route: "/admin/setup", heading: "Integration Credentials" },
  { label: "User Access", route: "/admin/access", heading: "Recent Access Changes" },
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

  test("opens every page from the sidebar on its own route", async ({ page }) => {
    const assertNoErrors = trackPageErrors(page);

    await page.goto(demoUrl);

    for (const target of pages) {
      await openPage(page, target.label);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(target.route);
    }

    assertNoErrors();
  });

  test("renders a deep link on first load without hydration errors", async ({ page }) => {
    const assertNoErrors = trackPageErrors(page);

    for (const target of pages) {
      await page.goto(`${demoUrl}${target.route}`);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
    }

    assertNoErrors();
  });

  test("supports browser back and forward between pages", async ({ page }) => {
    await page.goto(demoUrl);
    await openPage(page, "Risk Events");
    await expect(page.getByRole("heading", { name: "Risk Event Workbench" })).toBeVisible();
    await openPage(page, "Call Logs");
    await expect(page.getByRole("heading", { name: "Linked Risk Event" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Risk Event Workbench" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Top Risky Applications" })).toBeVisible();
    await page.goForward();
    expect(new URL(page.url()).pathname).toBe("/risk-events");
  });

  test("redirects old ?page= links to the matching route with their filters", async ({ page }) => {
    await page.goto(`${demoUrl}/?page=risk-events&level=severe`);

    await expect(page).toHaveURL(`${demoUrl}/risk-events?level=severe`);
    await expect(page.locator("select").filter({ hasText: "All Levels" })).toHaveValue("severe");

    await page.goto(`${demoUrl}/?page=policy`);
    await expect(page).toHaveURL(`${demoUrl}/admin/policy`);
  });

  test("sends a profile without admin access away from an admin route", async ({ page }) => {
    await page.goto(`${demoUrl}/admin/policy`);
    await expect(page.getByRole("heading", { name: "Rule Library" })).toBeVisible();

    await page.locator("header select").selectOption("Global User");

    await expect(page.getByRole("heading", { name: "Top Risky Applications" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("switching to App Owner hides admin pages and narrows data", async ({ page }) => {
    await page.goto(`${demoUrl}/applications`);
    await expect(page.getByRole("button", { name: /Finance Approval Agent/ }).first()).toBeVisible();

    await page.locator("header select").selectOption("App Owner");

    await expect(sidebar(page).getByRole("link", { name: "Policy Center" })).toHaveCount(0);
    await expect(page.getByText("Assigned Apps: 3")).toBeVisible();
    await expect(page.getByRole("button", { name: /Customer Support Copilot/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Finance Approval Agent/ })).toHaveCount(0);
  });

  test("applies risk event filters from the URL and from the controls", async ({ page }) => {
    const filtered = page.waitForResponse((response) => /\/api\/risk-events\?.*level=severe/.test(response.url()));

    await page.goto(`${demoUrl}/risk-events?level=severe`);
    expect((await (await filtered).json()).pagination.totalItems).toBeGreaterThanOrEqual(292);

    const blocked = page.waitForResponse((response) => /\/api\/risk-events\?.*action=block/.test(response.url()));

    await page.locator("select").filter({ hasText: "All Actions" }).selectOption("block");
    expect((await (await blocked).json()).data.every((event: { action: string }) => event.action === "block")).toBe(true);
    await expect(page).toHaveURL(/action=block/);
    await expect(page.getByRole("heading", { name: "Matched Rules & Evidence" })).toBeVisible();
  });

  test("rejects writes with a read-only message", async ({ page }) => {
    await page.goto(`${demoUrl}/admin/policy`);
    await expect(page.getByRole("heading", { name: "Rule Library" })).toBeVisible();

    const toggle = page.waitForResponse((response) => response.url().includes("/toggle") && response.request().method() === "POST");

    await page.getByRole("button", { name: "Enabled", exact: true }).first().click();
    expect((await toggle).status()).toBe(403);
    await expect(page.getByText("Demo mode is read-only.")).toBeVisible();
  });
});
