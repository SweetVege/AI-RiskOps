import { apiError, apiOk } from "@/lib/api/response";
import { batchSchema, maxBatchSize } from "@/lib/ingestion/schema";
import {
  auditRejectedRequest,
  checkRateLimit,
  ingestModelCall,
  resolveCredentialAuth,
  type IngestionContext,
  type IngestionFailure,
} from "@/lib/ingestion/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const raw = await request.json().catch(() => null) as unknown;
  const credentialAuth = await resolveCredentialAuth(request.headers);
  const context: IngestionContext = {
    headers: request.headers,
    scope: null,
    requestProfile: "application-credential",
    credential: credentialAuth && "credential" in credentialAuth ? credentialAuth.credential : null,
    startedAt,
  };
  const batch = batchSchema.safeParse(raw);
  let rejection: IngestionFailure | null = null;

  if (!credentialAuth) {
    rejection = {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Batch ingestion requires an application API key.",
      details: { required: "Authorization: Bearer <application_api_key>" },
    };
  } else if ("error" in credentialAuth) {
    rejection = credentialAuth.error;
  } else if (!batch.success) {
    rejection = {
      status: 400,
      code: raw === null ? "INVALID_JSON" : "VALIDATION_ERROR",
      message: `Request body must be a JSON object with 1 to ${maxBatchSize} calls.`,
      details: { maxBatchSize },
    };
  } else {
    rejection = await checkRateLimit(credentialAuth.credential, batch.data.calls.length);
  }

  if (rejection || !batch.success) {
    const failure = rejection as IngestionFailure;
    await auditRejectedRequest(context, null, failure);

    return apiError(failure.status, failure.code, failure.message, failure.details, failure.headers);
  }

  const results: Array<{ index: number; status: "created" | "duplicate" | "rejected" } & Record<string, unknown>> = [];

  // Sequential so calls sharing a trace ID resolve deterministically as created then duplicate.
  for (const [index, call] of batch.data.calls.entries()) {
    const outcome = await ingestModelCall({ ...context, startedAt: Date.now() }, call);

    if (outcome.ok) {
      const data = outcome.data as {
        ingestion: { traceId: string };
        callLog: { id: string; score: number; level: string; action: string };
        riskEvent: { id: string } | null;
      };

      results.push({
        index,
        status: outcome.duplicate ? "duplicate" : "created",
        traceId: data.ingestion.traceId,
        callLogId: data.callLog.id,
        riskEventId: data.riskEvent?.id ?? null,
        score: data.callLog.score,
        level: data.callLog.level,
        action: data.callLog.action,
      });
    } else {
      results.push({
        index,
        status: "rejected",
        traceId: outcome.traceId,
        errorCode: outcome.failure.code,
        error: outcome.failure.message,
        details: outcome.failure.details,
      });
    }
  }

  const count = (status: string) => results.filter((result) => result.status === status).length;

  return apiOk({
    data: {
      summary: {
        received: results.length,
        created: count("created"),
        duplicate: count("duplicate"),
        rejected: count("rejected"),
      },
      results,
    },
  });
}
