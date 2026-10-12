import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import { dataProtectionMeta, protectCapturedFields } from "@/lib/api/data-protection";
import { paginationFromSearchParams, paginationResponse } from "@/lib/api/pagination";
import { scopedCallLogWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewCallLogs");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const applicationId = searchParams.get("application_id");
  const environment = searchParams.get("environment");
  const level = searchParams.get("level");
  const action = searchParams.get("action");
  const hasEvent = searchParams.get("has_event");
  const q = searchParams.get("q")?.trim();
  const pagination = paginationFromSearchParams(searchParams);

  const where = {
    ...scopedCallLogWhere(scope, applicationId),
    ...(environment ? { environment } : {}),
    ...(level ? { level } : {}),
    ...(action ? { action } : {}),
    ...(hasEvent === "true" ? { riskEvent: { isNot: null } } : {}),
    ...(hasEvent === "false" ? { riskEvent: { is: null } } : {}),
    ...(q
      ? {
          OR: [
            { traceId: { contains: q } },
            { userRef: { contains: q } },
            { model: { contains: q } },
            { prompt: { contains: q } },
            { output: { contains: q } },
            { ragContext: { contains: q } },
            { toolCall: { contains: q } },
            { application: { name: { contains: q } } },
          ],
        }
      : {}),
  };

  const [totalItems, callLogs] = await Promise.all([
    prisma.aiCallLog.count({ where }),
    prisma.aiCallLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        application: true,
        riskEvent: {
          include: {
            ruleMatches: {
              include: {
                riskRule: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return apiOk({
    scope: scopeResponse(scope),
    filters: {
      applicationId,
      environment,
      level,
      action,
      hasEvent,
      q,
    },
    pagination: paginationResponse({
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    }),
    data: callLogs.map((log) => {
      const protectedFields = protectCapturedFields(log);

      return {
        id: log.id,
        traceId: log.traceId,
        occurredAt: log.occurredAt.toISOString(),
        application: {
          id: log.application.id,
          name: log.application.name,
          slug: log.application.slug,
        },
        userRef: log.userRef,
        model: log.model,
        environment: log.environment,
        score: log.score,
        level: log.level,
        action: log.action,
        promptPreview: truncate(protectedFields.prompt, 160),
        outputPreview: truncate(protectedFields.output, 160),
        ragContextPreview: truncate(protectedFields.ragContext, 160),
        toolCall: protectedFields.toolCall,
        dataProtection: dataProtectionMeta(protectedFields.findings),
        linkedRiskEvent: log.riskEvent
          ? {
              id: log.riskEvent.id,
              title: log.riskEvent.title,
              level: log.riskEvent.level,
              action: log.riskEvent.action,
              reviewStatus: log.riskEvent.reviewStatus,
              matchedRules: log.riskEvent.ruleMatches.map((match) => ({
                id: match.riskRule.id,
                name: match.riskRule.name,
                category: match.riskRule.category,
              })),
            }
          : null,
      };
    }),
  });
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}
