import { loadApplicationRiskStats } from "@/lib/api/application-stats";
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
    },
  });

  const stats = await loadApplicationRiskStats(applications.map((application) => application.id));

  return apiOk({
    scope: scopeResponse(scope),
    data: applications.map((application) => {
      const applicationStats = stats.get(application.id);


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
          callLogCount: applicationStats.callLogCount,
          riskEventCount: applicationStats.riskEventCount,
          severeCount: applicationStats.severeCount,
          highCount: applicationStats.highCount,
          maxRiskScore: applicationStats.maxRiskScore,
          latestEventAt: applicationStats.latestEventAt?.toISOString() ?? null,
        },
      };
    }),
  });
}
