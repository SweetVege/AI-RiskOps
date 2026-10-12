import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { scopedApplicationWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "canViewApplications");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const applications = await prisma.application.findMany({
    where: scopedApplicationWhere(scope),
    orderBy: { name: "asc" },
    include: {
      policyTemplate: true,
      environments: {
        orderBy: { name: "asc" },
      },
      validationChecks: {
        orderBy: { label: "asc" },
      },
      riskEvents: {
        select: {
          id: true,
          level: true,
          score: true,
          action: true,
          reviewStatus: true,
          occurredAt: true,
        },
      },
      _count: {
        select: {
          callLogs: true,
          riskEvents: true,
        },
      },
    },
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: applications.map((application) => {
      const severeCount = application.riskEvents.filter((event) => event.level === "severe").length;
      const highCount = application.riskEvents.filter((event) => event.level === "high").length;
      const latestEventAt = application.riskEvents
        .map((event) => event.occurredAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: application.id,
        name: application.name,
        slug: application.slug,
        ownerTeam: application.ownerTeam,
        status: application.status,
        integrationMethod: application.integrationMethod,
        fieldCoverage: application.fieldCoverage,
        policyTemplate: application.policyTemplate
          ? {
              id: application.policyTemplate.id,
              name: application.policyTemplate.name,
              enabled: application.policyTemplate.enabled,
            }
          : null,
        environments: application.environments,
        validationChecks: application.validationChecks,
        metrics: {
          callLogCount: application._count.callLogs,
          riskEventCount: application._count.riskEvents,
          severeCount,
          highCount,
          maxRiskScore: application.riskEvents.reduce((max, event) => Math.max(max, event.score), 0),
          latestEventAt: latestEventAt?.toISOString() ?? null,
        },
      };
    }),
  });
}
