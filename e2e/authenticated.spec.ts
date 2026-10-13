import { expect, test } from "@playwright/test";
import { authUrl, openPage, sidebar, signIn, trackPageErrors, users } from "./helpers";

test.describe("signed-in mode", () => {
  test("redirects to the login page without a session", async ({ page }) => {
    await page.goto(`${authUrl}/risk-events`);

    await expect(page).toHaveURL(`${authUrl}/login`);
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    expect((await page.request.get(`${authUrl}/api/risk-events`)).status()).toBe(401);
  });

  test("shows an access-pending page to a user without a permission set", async ({ page, context }) => {
    await signIn(context, { email: "e2e.newcomer@example.com", name: "Newcomer" });
    await page.goto(authUrl);

    await expect(page.getByRole("heading", { name: "Access pending" })).toBeVisible();
    await expect(page.getByText("e2e.newcomer@example.com")).toBeVisible();
  });

  test("gives a Platform Admin every page and no profile switcher", async ({ page, context }) => {
    const assertNoErrors = trackPageErrors(page);

    await signIn(context, users.admin);
    await page.goto(authUrl);

    await expect(page.getByText("Platform Admin · Platform Admin")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.locator("header select")).toHaveCount(0);
    await expect(page.getByText("Public demo mode")).toBeHidden();

    await openPage(page, "User Access");
    await expect(page.getByRole("button", { name: /app\.owner@example\.com/ })).toBeVisible();
    assertNoErrors();
  });

  test("limits an App Owner to assigned applications and non-admin pages", async ({ page, context }) => {
    await signIn(context, users.owner);
    await page.goto(`${authUrl}/admin/policy`);

    await expect(page.getByRole("heading", { name: "AI Application Risk Overview" })).toBeVisible();
    await expect(page).toHaveURL(`${authUrl}/`);
    await expect(sidebar(page).getByRole("link", { name: "Policy Center" })).toHaveCount(0);

    await openPage(page, "Applications");
    await expect(page.getByRole("button", { name: /Customer Support Copilot/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Finance Approval Agent/ })).toHaveCount(0);
    expect((await page.request.get(`${authUrl}/api/admin/policy-center?profile=platform-admin`)).status()).toBe(403);
  });

  test("returns to the login page when the session expires mid-use", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(authUrl);
    await expect(page.getByRole("heading", { name: "Top Risky Applications" })).toBeVisible();

    await context.clearCookies();
    await openPage(page, "Risk Events");

    await expect(page).toHaveURL(`${authUrl}/login`);
  });

  test("drills from analytics into filtered risk events", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(`${authUrl}/analytics`);

    await expect(page.getByRole("button", { name: /High\+Severe Rate\s*79%/ })).toBeVisible();
    await page.getByRole("button", { name: /^DLP-002/ }).click();
    await expect(page.getByRole("heading", { name: "Drill-down Evidence" })).toBeVisible();

    await page.getByRole("button", { name: "Open in Risk Events" }).first().click();
    await expect(page.getByRole("heading", { name: "Risk Event Workbench" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/risk-events");
    await expect(page).toHaveURL(/source=/);
    await expect(page).toHaveURL(/label=/);
  });

  test("saves a risk event review and keeps it after reload", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(`${authUrl}/risk-events`);
    await expect(page.getByRole("heading", { name: "Review Metadata" })).toBeVisible();

    const reviewStatus = page.locator("select").filter({ hasText: "False Positive" }).last();
    const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/api/risk-events/"));

    await reviewStatus.selectOption("escalated");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const response = await saved;
    const eventId = (await response.json()).data.id as string;

    expect(response.status()).toBe(200);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Review Metadata" })).toBeVisible();
    expect((await (await page.request.get(`${authUrl}/api/risk-events/${eventId}`)).json()).data.reviewStatus).toBe("escalated");
  });

  test("simulates ingestion from the Policy Center sandbox", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/policy`);
    await expect(page.getByRole("heading", { name: "Detection Sandbox" })).toBeVisible();

    const ingested = page.waitForResponse((response) => response.url().includes("/api/ingest/model-call") && response.request().method() === "POST");

    await page.getByRole("button", { name: "Simulate Ingestion & Generate Event" }).click();

    const response = await ingested;
    const payload = await response.json();

    expect(response.status()).toBe(201);
    await expect(page).toHaveURL(`${authUrl}/call-logs`);
    await expect(page.getByRole("heading", { name: payload.data.callLog.id })).toBeVisible();
    expect(payload.data.riskEvent.id).toMatch(/^evt-/);
    expect(payload.data.ingestion.policy.templateId).toBe("policy-customer-support");
  });

  test("previews the sandbox sample with the application's own policy", async ({ page, context }) => {
    const setRule = (enabled: boolean) =>
      page.request.post(`${authUrl}/api/admin/policy-center/rules/DLP-001/toggle`, { data: { enabled } });

    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/policy`);

    const result = page.locator("aside").filter({ hasText: "Detection Result" });

    // The default sample is a Customer Support Copilot call that leaks a phone number.
    await expect(result.getByText("Scored with Customer Support Copilot Policy as bound to Customer Support Copilot.")).toBeVisible();
    await expect(result.getByText(/DLP-001 · Personal Sensitive Information/)).toBeVisible();

    try {
      expect((await setRule(false)).status()).toBe(200);

      const evaluated = page.waitForResponse((response) => response.url().includes("/api/admin/policy-center/evaluate"));

      await page.getByRole("button", { name: "Run Detection" }).click();
      expect((await evaluated).status()).toBe(200);
      await expect(result.getByText("No active rules matched.")).toBeVisible();
      await expect(result.getByText(/DLP-001 · Personal Sensitive Information/)).toHaveCount(0);
    } finally {
      expect((await setRule(true)).status()).toBe(200);
    }

    // A sample for an application that is not registered falls back to the whole catalog.
    await page.getByRole("button", { name: /RAG Knowledge Base: Indirect Prompt Injection/ }).click();
    await expect(result.getByText(/No registered application has this name/)).toBeVisible();
    await expect(result.getByText(/PI-002 · Indirect Prompt Injection/)).toBeVisible();
  });

  test("holds a rule's action behind a score threshold set in Template Rule Tuning", async ({ page, context }) => {
    const policyRuleId = "policy-customer-support-DLP-001";
    const reset = () => page.request.patch(`${authUrl}/api/admin/policy-center/policy-rules/${policyRuleId}`, {
      data: { actionOverride: null, thresholdOverride: null },
    });

    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/policy`);

    const tuning = page.locator("section").filter({ has: page.getByRole("heading", { name: "Template Rule Tuning" }) }).last();
    const row = tuning.locator('[data-rule-id="DLP-001"]');
    const result = page.locator("aside").filter({ hasText: "Detection Result" });

    await expect(tuning.getByLabel("Policy template")).toHaveValue("policy-customer-support");
    await expect(tuning.locator('[data-rule-id="PI-001"]').getByLabel("Threshold for PI-001")).toBeDisabled();
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(result.getByRole("heading", { name: "High · Redact" })).toBeVisible();

    try {
      // The default sandbox sample scores 65, so a threshold of 90 keeps the redaction from applying.
      await row.getByLabel("Threshold for DLP-001").fill("90");

      const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(policyRuleId));

      await row.getByRole("button", { name: "Save" }).click();
      expect((await saved).status()).toBe(200);
      await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
      await expect(row.getByLabel("Threshold for DLP-001")).toHaveValue("90");

      await page.getByRole("button", { name: "Run Detection" }).click();
      await expect(result.getByRole("heading", { name: "High · Flag" })).toBeVisible();
      await expect(result.getByText("Held at Flag: Redact applies from score 90.")).toBeVisible();

      if (process.env.E2E_SHOTS) {
        await tuning.screenshot({ path: `${process.env.E2E_SHOTS}/tuning.png` });
        await result.screenshot({ path: `${process.env.E2E_SHOTS}/held.png` });
      }

      await row.getByLabel("Threshold for DLP-001").fill("101");
      await row.getByRole("button", { name: "Save" }).click();
      await expect(tuning.getByText(/whole number from 1 to 100/)).toBeVisible();
    } finally {
      expect((await reset()).status()).toBe(200);
    }
  });

  test("toggles a rule off and on in Policy Center", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/policy`);
    await expect(page.getByRole("heading", { name: "Rule Library" })).toBeVisible();

    const state = async () => {
      const payload = await (await page.request.get(`${authUrl}/api/admin/policy-center`)).json();

      return payload.data.policyRules
        .filter((rule: { riskRule: { id: string } }) => rule.riskRule.id === "DLP-001")
        .every((rule: { enabled: boolean }) => rule.enabled) as boolean;
    };

    expect(await state()).toBe(true);

    // Baseline rules are always enforced, so their switch is locked.
    const baselineRow = page
      .locator("tr, div")
      .filter({ hasText: /^PI-001/ })
      .filter({ has: page.getByRole("button", { name: "Always on" }) })
      .last();

    await expect(baselineRow.getByRole("button", { name: "Always on" })).toBeDisabled();

    // The sandbox further down also shows a DLP-001 card, so pick the row that owns a state switch.
    const row = page
      .locator("tr, div")
      .filter({ hasText: /^DLP-001/ })
      .filter({ has: page.getByRole("button", { name: /^(Enabled|Disabled|Partial)$/ }) })
      .last();
    const toggled = () => page.waitForResponse((response) => response.url().includes("/rules/DLP-001/toggle"));

    let pending = toggled();
    await row.getByRole("button", { name: "Enabled", exact: true }).click();
    expect((await pending).status()).toBe(200);
    expect(await state()).toBe(false);

    pending = toggled();
    await row.getByRole("button", { name: "Disabled", exact: true }).click();
    expect((await pending).status()).toBe(200);
    expect(await state()).toBe(true);
  });

  test("lists call logs with linked events and credentials in setup", async ({ page, context }) => {
    await signIn(context, users.admin);
    await page.goto(`${authUrl}/call-logs`);
    await expect(page.getByRole("heading", { name: "Prompt", exact: true })).toBeVisible();

    await openPage(page, "Application Setup");
    await expect(page.getByRole("heading", { name: "Integration Credentials" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rotate" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ingestion Request Audit" })).toBeVisible();
  });
});
