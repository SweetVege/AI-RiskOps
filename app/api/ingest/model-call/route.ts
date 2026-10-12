import { ingestionContract } from "@/lib/api/ingestion-contract";
import { apiError, apiOk } from "@/lib/api/response";
import { resolveRequestScope, scopeResponse } from "@/lib/api/scope";
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
  const { searchParams } = new URL(request.url);
  const scope = await resolveRequestScope(searchParams);
  const raw = await request.json().catch(() => null) as unknown;
  const credentialAuth = await resolveCredentialAuth(request.headers);
  const context: IngestionContext = {
    headers: request.headers,
    scope,
    requestProfile: scope.profile,
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

  return apiOk({ scope: scopeResponse(scope), data: outcome.data }, outcome.status);
}
