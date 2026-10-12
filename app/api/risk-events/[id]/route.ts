import { authorizeRequest } from "@/lib/api/authorize";
import { apiError, apiOk } from "@/lib/api/response";
import { dataProtectionMeta, protectCapturedFields, protectCapturedText } from "@/lib/api/data-protection";
import { permissionsForScope } from "@/lib/api/permissions";
import { scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const reviewStatuses = new Set([
  "pending_review",
  "in_review",
  "in_progress",
  "confirmed",
  "false_positive",
  "resolved",
  "escalated",
]);

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await authorizeRequest(request, "canViewRiskEvents");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  const event = await prisma.riskEvent.findFirst({
    where: {
      ...scopedRiskEventWhere(scope),
      id,
    },
    include: {
      application: true,
      ruleMatches: {
        include: {
          riskRule: true,
        },
      },
      evidence: true,
      sourceCallLog: true,
    },
  });

  if (!event) {
    return apiError(404, "NOT_FOUND", "Risk event not found or outside current scope.", { id });
  }

  const protectedSourceCallLog = protectCapturedFields(event.sourceCallLog);

  return apiOk({
    scope: scopeResponse(scope),
    data: {
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
      model: event.model,
      environment: event.environment,
      score: event.score,
      level: event.level,
      action: event.action,
      reviewStatus: event.reviewStatus,
      owner: event.owner,
      sla: event.sla,
      riskExplanation: event.riskExplanation,
      affectedAsset: event.affectedAsset,
      recommendation: event.recommendation,
      matchedRules: event.ruleMatches.map((match) => match.riskRule),
      evidence: event.evidence.map((item) => ({
        id: item.id,
        riskRuleId: item.riskRuleId,
        signal: item.signal,
        evidence: protectCapturedText(item.evidence).value,
        impact: protectCapturedText(item.impact).value,
      })),
      callLogs: [{
        id: event.sourceCallLog.id,
        traceId: event.sourceCallLog.traceId,
        occurredAt: event.sourceCallLog.occurredAt.toISOString(),
        userRef: event.sourceCallLog.userRef,
        model: event.sourceCallLog.model,
        environment: event.sourceCallLog.environment,
        score: event.sourceCallLog.score,
        level: event.sourceCallLog.level,
        action: event.sourceCallLog.action,
        prompt: protectedSourceCallLog.prompt,
        output: protectedSourceCallLog.output,
        ragContext: protectedSourceCallLog.ragContext,
        toolCall: protectedSourceCallLog.toolCall,
        dataProtection: dataProtectionMeta(protectedSourceCallLog.findings),
      }],
      updatedAt: event.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await authorizeRequest(request, "canViewRiskEvents");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const permissions = await permissionsForScope(scope);

  if (!permissions.canUpdateRiskEventReview) {
    return apiError(403, "FORBIDDEN", "This profile cannot update risk event review metadata.");
  }

  const body = await request.json().catch(() => null) as {
    reviewStatus?: unknown;
    owner?: unknown;
  } | null;
  const reviewStatus = typeof body?.reviewStatus === "string" ? body.reviewStatus : null;
  const owner = typeof body?.owner === "string" ? body.owner.trim() : undefined;

  if (reviewStatus && !reviewStatuses.has(reviewStatus)) {
    return apiError(400, "VALIDATION_ERROR", "Invalid review status.", {
      allowed: Array.from(reviewStatuses),
    });
  }

  if (!reviewStatus && owner === undefined) {
    return apiError(400, "VALIDATION_ERROR", "Provide reviewStatus or owner to update.");
  }

  const existingEvent = await prisma.riskEvent.findFirst({
    where: {
      ...scopedRiskEventWhere(scope),
      id,
    },
    select: { id: true },
  });

  if (!existingEvent) {
    return apiError(404, "NOT_FOUND", "Risk event not found or outside current scope.", { id });
  }

  const updatedEvent = await prisma.riskEvent.update({
    where: { id },
    data: {
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(owner !== undefined ? { owner: owner || "Unassigned" } : {}),
      updatedAt: new Date(),
    },
    include: {
      application: true,
      ruleMatches: {
        include: {
          riskRule: true,
        },
      },
      evidence: true,
      sourceCallLog: true,
    },
  });

  const protectedSourceCallLog = protectCapturedFields(updatedEvent.sourceCallLog);

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      id: updatedEvent.id,
      occurredAt: updatedEvent.occurredAt.toISOString(),
      application: {
        id: updatedEvent.application.id,
        name: updatedEvent.application.name,
        slug: updatedEvent.application.slug,
      },
      title: updatedEvent.title,
      userRef: updatedEvent.userRef,
      department: updatedEvent.department,
      model: updatedEvent.model,
      environment: updatedEvent.environment,
      score: updatedEvent.score,
      level: updatedEvent.level,
      action: updatedEvent.action,
      reviewStatus: updatedEvent.reviewStatus,
      owner: updatedEvent.owner,
      sla: updatedEvent.sla,
      riskExplanation: updatedEvent.riskExplanation,
      affectedAsset: updatedEvent.affectedAsset,
      recommendation: updatedEvent.recommendation,
      matchedRules: updatedEvent.ruleMatches.map((match) => match.riskRule),
      evidence: updatedEvent.evidence.map((item) => ({
        id: item.id,
        riskRuleId: item.riskRuleId,
        signal: item.signal,
        evidence: protectCapturedText(item.evidence).value,
        impact: protectCapturedText(item.impact).value,
      })),
      callLogs: [{
        id: updatedEvent.sourceCallLog.id,
        traceId: updatedEvent.sourceCallLog.traceId,
        occurredAt: updatedEvent.sourceCallLog.occurredAt.toISOString(),
        userRef: updatedEvent.sourceCallLog.userRef,
        model: updatedEvent.sourceCallLog.model,
        environment: updatedEvent.sourceCallLog.environment,
        score: updatedEvent.sourceCallLog.score,
        level: updatedEvent.sourceCallLog.level,
        action: updatedEvent.sourceCallLog.action,
        prompt: protectedSourceCallLog.prompt,
        output: protectedSourceCallLog.output,
        ragContext: protectedSourceCallLog.ragContext,
        toolCall: protectedSourceCallLog.toolCall,
        dataProtection: dataProtectionMeta(protectedSourceCallLog.findings),
      }],
      updatedAt: updatedEvent.updatedAt.toISOString(),
    },
  });
}
