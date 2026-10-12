import { authorizeRequest } from "@/lib/api/authorize";
import { apiError, apiOk } from "@/lib/api/response";
import { dataProtectionMeta, protectCapturedFields, protectCapturedText } from "@/lib/api/data-protection";
import { scopedCallLogWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await authorizeRequest(request, "canViewCallLogs");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const callLog = await prisma.aiCallLog.findFirst({
    where: {
      ...scopedCallLogWhere(scope),
      id,
    },
    include: {
      application: true,
      riskEvent: {
        include: {
          application: true,
          ruleMatches: {
            include: {
              riskRule: true,
            },
          },
          evidence: true,
        },
      },
    },
  });

  if (!callLog) {
    return apiError(404, "NOT_FOUND", "Call log not found or outside current scope.", { id });
  }

  const protectedFields = protectCapturedFields(callLog);

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      id: callLog.id,
      traceId: callLog.traceId,
      occurredAt: callLog.occurredAt.toISOString(),
      application: {
        id: callLog.application.id,
        name: callLog.application.name,
        slug: callLog.application.slug,
      },
      userRef: callLog.userRef,
      model: callLog.model,
      environment: callLog.environment,
      score: callLog.score,
      level: callLog.level,
      action: callLog.action,
      prompt: protectedFields.prompt,
      output: protectedFields.output,
      ragContext: protectedFields.ragContext,
      toolCall: protectedFields.toolCall,
      dataProtection: dataProtectionMeta(protectedFields.findings),
      linkedRiskEvent: callLog.riskEvent
        ? {
            id: callLog.riskEvent.id,
            occurredAt: callLog.riskEvent.occurredAt.toISOString(),
            application: {
              id: callLog.riskEvent.application.id,
              name: callLog.riskEvent.application.name,
              slug: callLog.riskEvent.application.slug,
            },
            title: callLog.riskEvent.title,
            score: callLog.riskEvent.score,
            level: callLog.riskEvent.level,
            action: callLog.riskEvent.action,
            reviewStatus: callLog.riskEvent.reviewStatus,
            riskExplanation: callLog.riskEvent.riskExplanation,
            affectedAsset: callLog.riskEvent.affectedAsset,
            recommendation: callLog.riskEvent.recommendation,
            matchedRules: callLog.riskEvent.ruleMatches.map((match) => match.riskRule),
            evidence: callLog.riskEvent.evidence.map((item) => ({
              id: item.id,
              riskRuleId: item.riskRuleId,
              signal: item.signal,
              evidence: protectCapturedText(item.evidence).value,
              impact: protectCapturedText(item.impact).value,
            })),
          }
        : null,
    },
  });
}
