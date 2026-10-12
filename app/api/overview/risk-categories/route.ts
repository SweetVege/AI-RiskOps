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

  const [matchGroups, rules] = await Promise.all([
    prisma.riskEventRuleMatch.groupBy({
      by: ["riskRuleId"],
      where: { riskEvent: scopedRiskEventWhere(scope) },
      _count: { _all: true },
    }),
    prisma.riskRule.findMany({ select: { id: true, category: true } }),
  ]);
  const categoryByRule = new Map(rules.map((rule) => [rule.id, rule.category]));
  const categoryCounts = new Map<string, number>();

  for (const group of matchGroups) {
    const category = categoryByRule.get(group.riskRuleId);
    if (!category) continue;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + group._count._all);
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
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  });
}

