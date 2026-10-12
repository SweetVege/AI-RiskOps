import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { average } from "@/lib/api/overview";
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
    include: {
      riskEvents: {
        select: {
          id: true,
          level: true,
          score: true,
          action: true,
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

  const rankedApplications = applications
    .map((application) => {
      const severeCount = application.riskEvents.filter((event) => event.level === "severe").length;
      const highCount = application.riskEvents.filter((event) => event.level === "high").length;

      return {
        id: application.id,
        name: application.name,
        slug: application.slug,
        ownerTeam: application.ownerTeam,
        severeCount,
        highCount,
        riskEventCount: application._count.riskEvents,
        callLogCount: application._count.callLogs,
        blockedCount: application.riskEvents.filter((event) => event.action === "block").length,
        averageEventRiskScore: average(application.riskEvents.map((event) => event.score)),
        maxRiskScore: application.riskEvents.reduce((max, event) => Math.max(max, event.score), 0),
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

