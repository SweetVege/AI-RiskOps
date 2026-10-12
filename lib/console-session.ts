import { redirect } from "next/navigation";
import { cache } from "react";
import { capabilityKeys, permissionsForScope, type ApiCapability, type ApiPermissions } from "@/lib/api/permissions";
import { resolveUserScope, type RequestScope } from "@/lib/api/scope";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

export type ConsoleSession =
  | { mode: "demo" }
  | { mode: "anonymous" }
  | { mode: "user"; user: SessionUser; scope: RequestScope; permissions: ApiPermissions };

// Cached per request so the layout and the page it wraps resolve the signed-in user once.
export const getConsoleSession = cache(async (): Promise<ConsoleSession> => {
  if (isDemoMode()) {
    return { mode: "demo" };
  }

  const user = await getSessionUser();

  if (!user) {
    return { mode: "anonymous" };
  }

  const scope = await resolveUserScope(user);

  return { mode: "user", user, scope, permissions: await permissionsForScope(scope) };
});

export function hasAnyCapability(permissions: ApiPermissions) {
  return capabilityKeys.some((capability) => permissions[capability]);
}

const pageCapabilities: Array<[string, ApiCapability]> = [
  ["/", "canViewOverview"],
  ["/analytics", "canViewRiskAnalytics"],
  ["/risk-events", "canViewRiskEvents"],
  ["/call-logs", "canViewCallLogs"],
  ["/applications", "canViewApplications"],
  ["/admin/policy", "canViewPolicyCenter"],
  ["/admin/setup", "canViewApplicationSetup"],
  ["/admin/access", "canManageUserAccess"],
];

// Sends a signed-in user who cannot open this page to the first page they can. Demo mode is left to
// the client, where the simulated profile lives.
export async function requirePage(route: string) {
  const session = await getConsoleSession();

  if (session.mode !== "user") {
    return;
  }

  const capability = pageCapabilities.find(([path]) => path === route)?.[1];

  if (capability && !session.permissions[capability]) {
    const fallback = pageCapabilities.find(([path, required]) => path !== route && session.permissions[required]);

    // A user with no capability at all is shown the access-pending page by the layout.
    if (fallback) {
      redirect(fallback[0]);
    }
  }
}
