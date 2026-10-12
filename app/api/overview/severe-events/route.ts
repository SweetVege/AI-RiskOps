import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const limit = Number(searchParams.get("limit") ?? 3);

  const riskEvents = await prisma.riskEvent.findMany({
    where: {
      ...scopedRiskEventWhere(scope),
      level: "severe",
    },
    orderBy: [{ score: "desc" }, { occurredAt: "desc" }],
    take: Number.isFinite(limit) && limit > 0 ? limit : 3,
    include: {
      application: true,
      ruleMatches: {
        include: {
          riskRule: true,
        },
      },
    },
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: riskEvents.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      application: {
        id: event.application.id,
        name: event.application.name,
        slug: event.application.slug,
      },
      title: event.title,
      userRef: event.userRef,
      department: event.department,
      score: event.score,
      level: event.level,
      action: event.action,
      reviewStatus: event.reviewStatus,
      owner: event.owner,
      sla: event.sla,
      affectedAsset: event.affectedAsset,
      matchedRules: event.ruleMatches.map((match) => ({
        id: match.riskRule.id,
        name: match.riskRule.name,
        category: match.riskRule.category,
      })),
      detailHref: `/risk-events/${event.id}`,
    })),
  });
}

