import { expect, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

export const demoUrl = "http://127.0.0.1:3201";
export const authUrl = "http://127.0.0.1:3200";

// Seeded users from prisma/seed.mjs.
export const users = {
  admin: { email: "platform.admin@example.com", name: "Platform Admin" },
  owner: { email: "app.owner@example.com", name: "App Owner" },
  global: { email: "global.user@example.com", name: "Global User" },
};

// Signs the browser in by minting the same session cookie Auth.js issues after a GitHub sign-in.
export async function signIn(context: BrowserContext, user: { email: string; name: string }) {
  const value = await encode({
    token: { email: user.email, name: user.name, sub: user.email },
    secret: "e2e-only-secret",
    salt: "authjs.session-token",
  });

  await context.addCookies([{ name: "authjs.session-token", value, domain: "127.0.0.1", path: "/" }]);
}

// Fails the test on any uncaught page error or console error, which is how hydration bugs surface.
export function trackPageErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  return () => expect(errors).toEqual([]);
}

export function sidebar(page: Page) {
  return page.locator("aside").first();
}

export async function openPage(page: Page, label: string) {
  await sidebar(page).getByRole("link", { name: label }).click();
}
