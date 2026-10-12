import { expect, test, type Page } from "@playwright/test";
import { authUrl, signIn, users } from "./helpers";

function credentialRow(page: Page, applicationName: string) {
  return page.locator("div.grid").filter({ hasText: applicationName }).filter({ has: page.getByRole("button", { name: "Generate" }) });
}

function ingest(page: Page, secret: string, traceId: string) {
  return page.request.post(`${authUrl}/api/ingest/model-call`, {
    headers: { authorization: `Bearer ${secret}` },
    data: { request: { traceId }, content: { prompt: "Summarize the roadmap." } },
  });
}

// Clicks a credential action and returns the one-time secret the page reveals, if any.
async function credentialAction(page: Page, applicationName: string, action: "Generate" | "Rotate" | "Revoke") {
  const responded = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/api/admin/application-credentials"));

  await credentialRow(page, applicationName).getByRole("button", { name: action, exact: true }).click();

  const response = await responded;

  expect(response.status(), `${action} credential`).toBeLessThan(300);

  return ((await response.json()).data?.secret ?? null) as string | null;
}

test.describe("admin writes", () => {
  test("registers an application and takes its credential through generate, rotate, and revoke", async ({ page, context }) => {
    const applicationName = `E2E Billing Bot ${Date.now()}`;

    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/setup`);
    await expect(page.getByRole("heading", { name: "Register Application" })).toBeVisible();

    const register = page.getByRole("button", { name: "Register", exact: true });

    await expect(register).toBeDisabled();
    await page.getByPlaceholder("Application name").fill(applicationName);
    await page.getByPlaceholder("Owner team").fill("E2E Team");

    const registered = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().includes("/api/admin/application-setup"));

    await register.click();
    expect((await registered).status()).toBe(201);
    await expect(page.getByPlaceholder("Application name")).toHaveValue("");

    const row = credentialRow(page, applicationName);

    await expect(row).toHaveCount(1);
    await expect(row.getByText("No key")).toBeVisible();
    await expect(row.getByRole("button", { name: "Rotate", exact: true })).toBeDisabled();

    const firstSecret = await credentialAction(page, applicationName, "Generate");

    expect(firstSecret).toMatch(/^airk_/);
    await expect(page.getByText("New Credential Secret")).toBeVisible();
    await expect(page.getByText(firstSecret!, { exact: true }).first()).toBeVisible();
    await expect(row.getByText("No key")).toHaveCount(0);
    expect((await ingest(page, firstSecret!, "e2e-first-key")).status()).toBe(201);

    const secondSecret = await credentialAction(page, applicationName, "Rotate");

    expect(secondSecret).toMatch(/^airk_/);
    expect(secondSecret).not.toBe(firstSecret);
    await expect(page.getByText(secondSecret!, { exact: true }).first()).toBeVisible();
    expect((await ingest(page, firstSecret!, "e2e-old-key")).status()).toBe(401);
    expect((await ingest(page, secondSecret!, "e2e-rotated-key")).status()).toBe(201);

    await credentialAction(page, applicationName, "Revoke");

    await expect(row.getByRole("button", { name: "Revoke", exact: true })).toBeDisabled();
    await expect(row.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
    expect((await ingest(page, secondSecret!, "e2e-revoked-key")).status()).toBe(401);

    // The two accepted calls show up in the ingestion audit for this application.
    const audits = await (await page.request.get(`${authUrl}/api/admin/ingestion-audit`)).json();
    const traceIds = audits.data.map((audit: { traceId: string | null }) => audit.traceId);

    expect(traceIds).toEqual(expect.arrayContaining(["e2e-first-key", "e2e-rotated-key"]));
  });

  test("changes a user's permission set and application scope, then restores it", async ({ page, context, browser }) => {
    const sessionFor = async (user: { email: string; name: string }) => {
      const userContext = await browser.newContext();

      await signIn(userContext, user);

      const payload = await (await userContext.request.get(`${authUrl}/api/session`)).json();

      await userContext.close();

      return payload as { scope: { mode: string; applicationIds?: string[] }; data: { permissions: Record<string, boolean> } };
    };
    const save = page.getByRole("button", { name: "Save User Access" });
    const saveAndWait = async () => {
      const saved = page.waitForResponse((response) =>
        response.request().method() === "PATCH" && response.url().includes("/api/admin/user-access"));

      await save.click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByText("User access saved.")).toBeVisible();
    };

    expect((await sessionFor(users.global)).scope.mode).toBe("global");

    await signIn(context, users.admin);
    await page.goto(`${authUrl}/admin/access`);
    await page.getByRole("button", { name: /global\.user@example\.com/ }).click();

    const permissionSet = page.locator("select").filter({ hasText: "App Owner" });

    await expect(permissionSet).toHaveValue("perm-global-user");
    await expect(save).toBeDisabled();

    // An assigned-application permission set cannot be saved without at least one application.
    await permissionSet.selectOption("perm-app-owner");
    await expect(page.getByText("0 selected")).toBeVisible();
    await expect(save).toBeDisabled();

    await page.getByLabel(/Finance Approval Agent/).check();
    await page.getByLabel(/Sales Knowledge Agent/).check();
    await expect(page.getByText("2 selected")).toBeVisible();
    await saveAndWait();

    // The message survives the reload that follows a save, and the selection stays on the same user.
    await expect(permissionSet).toHaveValue("perm-app-owner");
    await expect(page.getByText("User access saved.")).toBeVisible();

    const narrowed = await sessionFor(users.global);

    expect(narrowed.scope.mode).toBe("assigned_applications");
    expect(narrowed.scope.applicationIds?.slice().sort()).toEqual(["app-finance-agent", "app-sales-knowledge"]);
    expect(narrowed.data.permissions.canUpdateRiskEventReview).toBe(false);

    await permissionSet.selectOption("perm-global-user");
    await expect(page.getByText("Global scope")).toBeVisible();
    await saveAndWait();

    const restored = await sessionFor(users.global);

    expect(restored.scope.mode).toBe("global");
    expect(restored.data.permissions.canUpdateRiskEventReview).toBe(true);

    const audit = await (await page.request.get(`${authUrl}/api/admin/user-access`)).json();

    expect(audit.data.accessAuditLogs.length).toBeGreaterThanOrEqual(2);
  });
});
