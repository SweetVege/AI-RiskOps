import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { average } from "@/lib/api/overview";
import { scopedCallLogWhere, scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const [callLogs, riskEvents] = await Promise.all([
    prisma.aiCallLog.findMany({
      where: scopedCallLogWhere(scope),
      select: {
        id: true,
        action: true,
        score: true,
      },
    }),
    prisma.riskEvent.findMany({
      where: scopedRiskEventWhere(scope),
      select: {
        id: true,
        action: true,
        score: true,
        level: true,
      },
    }),
  ]);

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      modelCallsToday: callLogs.length,
      riskEvents: riskEvents.length,
      blocked: riskEvents.filter((event) => event.action === "block").length,
      averageEventRiskScore: average(riskEvents.map((event) => event.score)),
      severeEvents: riskEvents.filter((event) => event.level === "severe").length,
      highRiskEvents: riskEvents.filter((event) => event.level === "high").length,
      blockedModelCalls: callLogs.filter((log) => log.action === "block").length,
    },
  });
}

