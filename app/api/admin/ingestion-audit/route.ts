import { authorizeRequest } from "@/lib/api/authorize";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canViewApplicationSetup"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canViewApplicationSetup"));
  }

  const audits = await prisma.ingestionRequestAudit.findMany({
    orderBy: { occurredAt: "desc" },
    take: 25,
    include: {
      application: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      credential: {
        select: {
          id: true,
          keyPrefix: true,
          status: true,
        },
      },
    },
  });

  const total = audits.length;
  const succeeded = audits.filter((audit) => audit.status === "success").length;
  const failed = audits.filter((audit) => audit.status === "failed").length;
  const credentialAuth = audits.filter((audit) => audit.authMode === "application_credential").length;
  const avgLatencyMs = Math.round(
    audits.reduce((sum, audit) => sum + audit.latencyMs, 0) / Math.max(total, 1),
  );
  const failureReasons = Object.entries(
    audits
      .filter((audit) => audit.status === "failed")
      .reduce<Record<string, number>>((acc, audit) => {
        const key = audit.errorCode ?? "UNKNOWN";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .map(([errorCode, count]) => ({ errorCode, count }))
    .sort((a, b) => b.count - a.count);

  return apiOk({
    scope: scopeResponse(scope),
    summary: {
      total,
      succeeded,
      failed,
      successRate: percentage(succeeded, total),
      credentialAuthRate: percentage(credentialAuth, total),
      avgLatencyMs,
      failureReasons,
    },
    data: audits.map((audit) => ({
      id: audit.id,
      occurredAt: audit.occurredAt.toISOString(),
      status: audit.status,
      authMode: audit.authMode,
      ingestionSource: audit.ingestionSource,
      application: audit.application
        ? {
            id: audit.application.id,
            name: audit.application.name,
            slug: audit.application.slug,
          }
        : null,
      credential: audit.credential
        ? {
            id: audit.credential.id,
            keyPrefix: audit.credential.keyPrefix,
            status: audit.credential.status,
          }
        : null,
      traceId: audit.traceId,
      sessionId: audit.sessionId,
      requestProfile: audit.requestProfile,
      httpStatus: audit.httpStatus,
      errorCode: audit.errorCode,
      errorMessage: audit.errorMessage,
      latencyMs: audit.latencyMs,
      callLogId: audit.callLogId,
      riskEventId: audit.riskEventId,
      model: audit.model,
      environment: audit.environment,
      dataProtectionMode: audit.dataProtectionMode,
    })),
  });
}
