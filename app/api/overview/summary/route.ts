import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { averageOf } from "@/lib/api/overview";
import { scopedCallLogWhere, scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const [callGroups, eventGroups] = await Promise.all([
    prisma.aiCallLog.groupBy({
      by: ["action"],
      where: scopedCallLogWhere(scope),
      _count: { _all: true },
    }),
    prisma.riskEvent.groupBy({
      by: ["level", "action"],
      where: scopedRiskEventWhere(scope),
      _count: { _all: true },
      _sum: { score: true },
    }),
  ]);
  const countCalls = (action?: string) => callGroups
    .filter((group) => !action || group.action === action)
    .reduce((sum, group) => sum + group._count._all, 0);
  const countEvents = (match: { level?: string; action?: string } = {}) => eventGroups
    .filter((group) => (!match.level || group.level === match.level) && (!match.action || group.action === match.action))
    .reduce((sum, group) => sum + group._count._all, 0);
  const scoreTotal = eventGroups.reduce((sum, group) => sum + (group._sum.score ?? 0), 0);

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      modelCallsToday: countCalls(),
      riskEvents: countEvents(),
      blocked: countEvents({ action: "block" }),
      averageEventRiskScore: averageOf(scoreTotal, countEvents()),
      severeEvents: countEvents({ level: "severe" }),
      highRiskEvents: countEvents({ level: "high" }),
      blockedModelCalls: countCalls("block"),
    },
  });
}

