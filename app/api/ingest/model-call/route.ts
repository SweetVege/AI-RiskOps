import { authorizeRequest } from "@/lib/api/authorize";
import { ingestionContract } from "@/lib/api/ingestion-contract";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse, type RequestScope } from "@/lib/api/scope";
import { isDemoMode } from "@/lib/demo-mode";
import {
  auditRejectedRequest,
  checkRateLimit,
  ingestModelCall,
  resolveCredentialAuth,
  type IngestionContext,
} from "@/lib/ingestion/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiOk({
    data: ingestionContract,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (isDemoMode()) {
    return apiError(403, "FORBIDDEN", "Demo mode is read-only.", { demoMode: true });
  }

  const credentialAuth = await resolveCredentialAuth(request.headers);
  let scope: RequestScope | null = null;

  // Without an application API key this is a signed-in admin replaying a call from the Policy Center sandbox.
  if (!credentialAuth) {
    const access = await authorizeRequest(request, "canManagePolicyCenter");

    if (!access.ok) {
      return access.response;
    }

    scope = access.scope;
  }

  const raw = await request.json().catch(() => null) as unknown;
  const context: IngestionContext = {
    headers: request.headers,
    scope,
    requestProfile: scope?.profile ?? "application-credential",
    credential: credentialAuth && "credential" in credentialAuth ? credentialAuth.credential : null,
    startedAt,
  };
  const rejection = credentialAuth && "error" in credentialAuth
    ? credentialAuth.error
    : context.credential
      ? await checkRateLimit(context.credential)
      : null;

  if (rejection) {
    await auditRejectedRequest(context, raw, rejection);

    return apiError(rejection.status, rejection.code, rejection.message, rejection.details, rejection.headers);
  }

  const outcome = await ingestModelCall(context, raw);

  if (!outcome.ok) {
    const { failure } = outcome;

    return apiError(failure.status, failure.code, failure.message, failure.details, failure.headers);
  }

  return apiOk({ ...(scope ? { scope: scopeResponse(scope) } : {}), data: outcome.data }, outcome.status);
}
