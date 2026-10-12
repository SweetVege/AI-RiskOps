import { authorizeRequest } from "@/lib/api/authorize";
import { apiError, apiOk } from "@/lib/api/response";
import { scopedApplicationWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await authorizeRequest(request, "canViewApplications");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const application = await prisma.application.findFirst({
    where: {
      ...scopedApplicationWhere(scope, id),
    },
    include: {
      policyTemplate: {
        include: {
          policyRules: {
            include: {
              riskRule: true,
            },
          },
        },
      },
      environments: {
        orderBy: { name: "asc" },
      },
      validationChecks: {
        orderBy: { label: "asc" },
      },
      riskEvents: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        include: {
          ruleMatches: {
            include: {
              riskRule: true,
            },
          },
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

  if (!application) {
    return apiError(404, "NOT_FOUND", "Application not found or outside current scope.", { id });
  }

  return apiOk({
    scope: scopeResponse(scope),
    data: {
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
            scope: application.policyTemplate.scope,
            defaultAction: application.policyTemplate.defaultAction,
            thresholds: application.policyTemplate.thresholds,
            enabled: application.policyTemplate.enabled,
            rules: application.policyTemplate.policyRules.map((policyRule) => ({
              ...policyRule.riskRule,
              enabled: policyRule.enabled,
              thresholdOverride: policyRule.thresholdOverride,
              actionOverride: policyRule.actionOverride,
            })),
          }
        : null,
      environments: application.environments,
      validationChecks: application.validationChecks,
      metrics: {
        callLogCount: application._count.callLogs,
        riskEventCount: application._count.riskEvents,
        severeCount: application.riskEvents.filter((event) => event.level === "severe").length,
        highCount: application.riskEvents.filter((event) => event.level === "high").length,
      },
      recentRiskEvents: application.riskEvents.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        title: event.title,
        score: event.score,
        level: event.level,
        action: event.action,
        reviewStatus: event.reviewStatus,
        matchedRules: event.ruleMatches.map((match) => match.riskRule),
      })),
    },
  });
}
