import { getSessionUser } from "@/lib/auth";
import { capabilityErrorMessage, hasCapability, type ApiCapability } from "@/lib/api/permissions";
import { apiError } from "@/lib/api/response";
import { resolveDemoScope, resolveUserScope, type RequestScope } from "@/lib/api/scope";
import { isDemoMode } from "@/lib/demo-mode";

export type RequestAccess =
  | { ok: true; scope: RequestScope }
  | { ok: false; response: Response };

const readMethods = new Set(["GET", "HEAD"]);

// Resolves who is calling and rejects the request when they are not signed in, lack the capability,
// or try to write while the deployment is in demo mode.
export async function authorizeRequest(
  request: Request,
  capability?: ApiCapability,
  // readOnly marks a non-GET endpoint that writes nothing, so demo mode still serves it.
  options: { readOnly?: boolean } = {},
): Promise<RequestAccess> {
  let scope: RequestScope;

  if (isDemoMode()) {
    if (!options.readOnly && !readMethods.has(request.method)) {
      return { ok: false, response: apiError(403, "FORBIDDEN", "Demo mode is read-only.", { demoMode: true }) };
    }

    scope = await resolveDemoScope(new URL(request.url).searchParams);
  } else {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return { ok: false, response: apiError(401, "UNAUTHORIZED", "Sign in required.") };
    }

    scope = await resolveUserScope(sessionUser);
  }

  if (capability && !(await hasCapability(scope, capability))) {
    return { ok: false, response: apiError(403, "FORBIDDEN", capabilityErrorMessage(capability)) };
  }

  return { ok: true, scope };
}
