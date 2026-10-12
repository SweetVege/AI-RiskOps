import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { loadApplicationRiskStats } from "@/lib/api/application-stats";
import { averageOf } from "@/lib/api/overview";
import { scopedApplicationWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const limit = Number(searchParams.get("limit") ?? 5);

  const applications = await prisma.application.findMany({
    where: scopedApplicationWhere(scope),
    select: { id: true, name: true, slug: true, ownerTeam: true },
  });
  const stats = await loadApplicationRiskStats(applications.map((application) => application.id));

  const rankedApplications = applications
    .map((application) => {
      const applicationStats = stats.get(application.id);

      return {
        id: application.id,
        name: application.name,
        slug: application.slug,
        ownerTeam: application.ownerTeam,
        severeCount: applicationStats.severeCount,
        highCount: applicationStats.highCount,
        riskEventCount: applicationStats.riskEventCount,
        callLogCount: applicationStats.callLogCount,
        blockedCount: applicationStats.blockedCount,
        averageEventRiskScore: averageOf(applicationStats.scoreTotal, applicationStats.riskEventCount),
        maxRiskScore: applicationStats.maxRiskScore,
      };
    })
    .sort((a, b) => {
      if (b.severeCount !== a.severeCount) {
        return b.severeCount - a.severeCount;
      }

      if (b.highCount !== a.highCount) {
        return b.highCount - a.highCount;
      }

      return b.maxRiskScore - a.maxRiskScore;
    })
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5);

  return apiOk({
    scope: scopeResponse(scope),
    sort: "severe_count_desc",
    data: rankedApplications,
  });
}

