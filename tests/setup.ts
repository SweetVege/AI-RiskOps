import { afterEach, vi } from "vitest";
import { signOut } from "./helpers/session";

// next-auth needs a Next.js request context, so tests drive the session through this mock instead.
vi.mock("@/lib/auth", async () => {
  const session = await import("./helpers/session");

  return { getSessionUser: async () => session.currentSessionUser() };
});

afterEach(() => {
  signOut();
  delete process.env.DEMO_MODE;
  delete process.env.AUTH_ADMIN_EMAILS;
});
