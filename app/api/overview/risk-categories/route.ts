import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { percentage } from "@/lib/api/overview";
import { scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const riskEvents = await prisma.riskEvent.findMany({
    where: scopedRiskEventWhere(scope),
    include: {
      ruleMatches: {
        include: {
          riskRule: true,
        },
      },
    },
  });

  const categoryCounts = new Map<string, number>();

  for (const event of riskEvents) {
    for (const match of event.ruleMatches) {
      const category = match.riskRule.category;
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const totalMatches = Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0);

  return apiOk({
    scope: scopeResponse(scope),
    data: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: percentage(count, totalMatches),
      }))
      .sort((a, b) => b.count - a.count),
  });
}

