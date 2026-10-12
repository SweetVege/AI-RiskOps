import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import {
  hashCredentialSecret,
  normalizeCredentialSource,
  normalizeCredentialStatus,
} from "@/lib/api/application-credentials";
import { updateApplicationIngestionValidation } from "@/lib/api/application-setup";
import { dataProtectionMeta, protectCapturedFields, protectCapturedText } from "@/lib/api/data-protection";
import type { IngestionSource } from "@/lib/api/ingestion-contract";
import type { ApiErrorCode } from "@/lib/api/response";
import { scopedApplicationWhere, type RequestScope } from "@/lib/api/scope";
import { loadEffectivePolicy } from "@/lib/policy/effective-policy";
import { auditMetaFromRaw, parseModelCall, type NormalizedIngestion } from "@/lib/ingestion/schema";
import { prisma } from "@/lib/prisma";
import { evaluateAiCall, type RiskEvaluation, type SandboxInput } from "@/lib/risk-engine";

export type IngestionCredential = {
  id: string;
  applicationId: string;
  status: string;
  integrationSource: string;
};

export type IngestionFailure = {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type CredentialAuthResult =
  | { credential: IngestionCredential }
  | { error: IngestionFailure }
  | null;

export type IngestionContext = {
  headers: Headers;
  // Null when the caller authenticated with an application credential only.
  scope: RequestScope | null;
  requestProfile: string;
  credential: IngestionCredential | null;
  startedAt: number;
};

export type IngestionOutcome =
  | { ok: true; status: 200 | 201; duplicate: boolean; data: Record<string, unknown> }
  | { ok: false; failure: IngestionFailure; traceId: string | null };

const defaultOutputByAction = {
  block: "The request was blocked and no model output was returned.",
  allow: "No model output sample.",
  flag: "No model output sample.",
  redact: "No model output sample.",
  review: "No model output sample.",
};

const defaultRateLimitPerMinute = 600;

function newId(prefix: string) {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function bearerToken(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);

  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

export async function resolveCredentialAuth(headers: Headers): Promise<CredentialAuthResult> {
  const token = bearerToken(headers);

  if (!token) {
    return null;
  }

  const credential = await prisma.applicationCredential.findUnique({
    where: { keyHash: hashCredentialSecret(token) },
    select: {
      id: true,
      applicationId: true,
      status: true,
      integrationSource: true,
    },
  });

  if (!credential) {
    return {
      error: {
        status: 401,
        code: "UNAUTHORIZED",
        message: "Application API key is invalid.",
        details: { authMode: "application_credential" },
      },
    };
  }

  const credentialStatus = normalizeCredentialStatus(credential.status);

  if (credentialStatus === "revoked" || credentialStatus === "not_created") {
    return {
      error: {
        status: 401,
        code: "UNAUTHORIZED",
        message: "Application API key is not active.",
        details: {
          authMode: "application_credential",
          credentialId: credential.id,
          status: credentialStatus,
        },
      },
    };
  }

  return { credential };
}

export function rateLimitPerMinute() {
  const configured = Number.parseInt(process.env.INGEST_RATE_LIMIT_PER_MINUTE ?? "", 10);

  return Number.isFinite(configured) && configured >= 0 ? configured : defaultRateLimitPerMinute;
}

// Counts audited requests instead of keeping in-memory state so the limit holds across serverless instances.
export async function checkRateLimit(credential: IngestionCredential, incoming = 1): Promise<IngestionFailure | null> {
  const limit = rateLimitPerMinute();

  if (limit === 0) {
    return null;
  }

  const recent = await prisma.ingestionRequestAudit.count({
    where: {
      credentialId: credential.id,
      occurredAt: { gte: new Date(Date.now() - 60_000) },
    },
  });

  if (recent + incoming <= limit) {
    return null;
  }

  return {
    status: 429,
    code: "RATE_LIMITED",
    message: "Ingestion rate limit exceeded for this application credential.",
    details: { limitPerMinute: limit, credentialId: credential.id },
    headers: { "Retry-After": "60" },
  };
}

type AuditInput = {
  context: IngestionContext;
  status: "success" | "failed";
  httpStatus: number;
  ingestionSource: IngestionSource;
  traceId: string | null;
  sessionId: string | null;
  model: string | null;
  environment: string | null;
  applicationId?: string | null;
  callLogId?: string | null;
  riskEventId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  dataProtectionMode?: string | null;
};

function auditData(input: AuditInput) {
  const { context } = input;

  return {
    id: newId("audit"),
    status: input.status,
    authMode: context.credential ? "application_credential" : "profile_scope",
    ingestionSource: context.credential
      ? normalizeCredentialSource(context.credential.integrationSource)
      : input.ingestionSource,
    applicationId: input.applicationId ?? context.credential?.applicationId ?? null,
    credentialId: context.credential?.id ?? null,
    traceId: input.traceId,
    sessionId: input.sessionId,
    requestProfile: context.requestProfile,
    httpStatus: input.httpStatus,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    latencyMs: Math.max(0, Date.now() - context.startedAt),
    callLogId: input.callLogId ?? null,
    riskEventId: input.riskEventId ?? null,
    model: input.model,
    environment: input.environment,
    dataProtectionMode: input.dataProtectionMode ?? null,
  };
}

async function writeAudit(input: AuditInput) {
  try {
    await prisma.ingestionRequestAudit.create({ data: auditData(input) });
  } catch (error) {
    console.error("Unable to write ingestion audit", error);
  }
}

export async function auditRejectedRequest(context: IngestionContext, raw: unknown, failure: IngestionFailure) {
  await writeAudit({
    context,
    status: "failed",
    httpStatus: failure.status,
    errorCode: failure.code,
    errorMessage: failure.message,
    ...auditMetaFromRaw(raw, context.headers),
  });
}

function normalizedAuditMeta(normalized: NormalizedIngestion) {
  return {
    ingestionSource: normalized.ingestionSource,
    traceId: normalized.traceId,
    sessionId: normalized.sessionId || null,
    model: normalized.modelName,
    environment: normalized.environment.toLowerCase(),
  };
}

function buildEventTitle(appName: string, evaluation: RiskEvaluation) {
  const firstFinding = evaluation.findings[0];
  return firstFinding
    ? `${appName} matched ${firstFinding.ruleName}`
    : `${appName} generated a risk event`;
}

function buildRiskExplanation(evaluation: RiskEvaluation) {
  const ruleSummary = evaluation.findings
    .map((finding) => `${finding.ruleId} (${finding.location})`)
    .join(", ");

  return `This event was generated because the model call matched ${ruleSummary}. The combined score, environment, data type, and tool context produced a ${evaluation.level} risk classification.`;
}

function ingestionMeta(context: IngestionContext, normalized: NormalizedIngestion, applicationId: string) {
  return {
    contractVersion: normalized.contractVersion,
    ingestionSource: context.credential
      ? normalizeCredentialSource(context.credential.integrationSource)
      : normalized.ingestionSource,
    authMode: context.credential ? "application_credential" : "profile_scope",
    credentialId: context.credential?.id ?? null,
    credentialStatus: context.credential ? normalizeCredentialStatus(context.credential.status) : null,
    traceId: normalized.traceId,
    sessionId: normalized.sessionId || null,
    applicationId,
  };
}

async function findExistingCall(applicationId: string, traceId: string) {
  return prisma.aiCallLog.findUnique({
    where: { applicationId_traceId: { applicationId, traceId } },
    include: { riskEvent: true },
  });
}

async function duplicateOutcome(
  context: IngestionContext,
  normalized: NormalizedIngestion,
  existing: NonNullable<Awaited<ReturnType<typeof findExistingCall>>>,
): Promise<IngestionOutcome> {
  const { riskEvent, ...callLog } = existing;

  await writeAudit({
    context,
    status: "success",
    httpStatus: 200,
    applicationId: callLog.applicationId,
    callLogId: callLog.id,
    riskEventId: riskEvent?.id ?? null,
    dataProtectionMode: "masked",
    ...normalizedAuditMeta(normalized),
  });

  return {
    ok: true,
    status: 200,
    duplicate: true,
    data: {
      ingestion: {
        ...ingestionMeta(context, normalized, callLog.applicationId),
        duplicate: true,
        dataProtection: dataProtectionMeta(),
      },
      callLog,
      riskEvent,
      evaluation: null,
    },
  };
}

export async function ingestModelCall(context: IngestionContext, raw: unknown): Promise<IngestionOutcome> {
  const { credential, scope } = context;
  const parsed = parseModelCall(raw, context.headers, { hasCredentialAuth: Boolean(credential) });

  if (!parsed.ok) {
    const failure: IngestionFailure = { status: 400, ...parsed.error };
    await auditRejectedRequest(context, raw, failure);

    return { ok: false, failure, traceId: auditMetaFromRaw(raw, context.headers).traceId };
  }

  const normalized = parsed.value;
  const reject = async (failure: IngestionFailure, applicationId?: string | null): Promise<IngestionOutcome> => {
    await writeAudit({
      context,
      status: "failed",
      httpStatus: failure.status,
      applicationId,
      errorCode: failure.code,
      errorMessage: failure.message,
      ...normalizedAuditMeta(normalized),
    });

    return { ok: false, failure, traceId: normalized.traceId };
  };

  if (credential && normalized.payloadApplicationId && normalized.payloadApplicationId !== credential.applicationId) {
    return reject({
      status: 403,
      code: "FORBIDDEN",
      message: "Payload application does not match the authenticated application credential.",
      details: {
        credentialApplicationId: credential.applicationId,
        payloadApplicationId: normalized.payloadApplicationId,
      },
    }, credential.applicationId);
  }

  const appSelector = normalized.applicationId
    ? { id: normalized.applicationId }
    : { OR: [{ name: normalized.applicationName }, { slug: normalized.applicationName }] };
  const application = credential
    ? await prisma.application.findUnique({ where: { id: credential.applicationId } })
    : scope
      ? await prisma.application.findFirst({ where: { AND: [scopedApplicationWhere(scope), appSelector] } })
      : null;

  if (!application) {
    return reject({
      status: 404,
      code: "NOT_FOUND",
      message: "Application not found or outside current scope.",
      details: { applicationId: normalized.applicationId, applicationName: normalized.applicationName },
    }, normalized.applicationId || null);
  }

  if (normalized.hasClientTraceId) {
    const existing = await findExistingCall(application.id, normalized.traceId);

    if (existing) {
      return duplicateOutcome(context, normalized, existing);
    }
  }

  const sandboxInput: SandboxInput = {
    templateId: normalized.templateId,
    app: application.name,
    userRole: normalized.userRole,
    environment: normalized.environment,
    dataType: normalized.dataType,
    prompt: normalized.prompt,
    output: normalized.output,
    ragContext: normalized.ragContext,
    toolCall: normalized.toolCall,
  };
  const policy = await loadEffectivePolicy(application.policyTemplateId);
  const evaluation = evaluateAiCall(sandboxInput, policy);
  const callLogId = newId("call");
  const riskEventId = evaluation.action === "allow" ? null : newId("evt");
  const output = normalized.output || defaultOutputByAction[evaluation.action];
  const environment = normalized.environment.toLowerCase();
  const protectedFields = protectCapturedFields({
    prompt: normalized.prompt,
    output,
    ragContext: normalized.ragContext,
    toolCall: normalized.toolCall || null,
  });

  try {
    const { callLog, riskEvent } = await prisma.$transaction(async (tx) => {
      const createdCallLog = await tx.aiCallLog.create({
        data: {
          id: callLogId,
          traceId: normalized.traceId,
          applicationId: application.id,
          occurredAt: normalized.occurredAt,
          userRef: normalized.userRef,
          model: normalized.modelName,
          environment,
          score: evaluation.score,
          level: evaluation.level,
          action: evaluation.action,
          prompt: protectedFields.prompt,
          output: protectedFields.output,
          ragContext: protectedFields.ragContext,
          toolCall: protectedFields.toolCall,
        },
      });
      const createdRiskEvent = riskEventId
        ? await tx.riskEvent.create({
            data: {
              id: riskEventId,
              applicationId: application.id,
              sourceCallLogId: createdCallLog.id,
              occurredAt: normalized.occurredAt,
              title: buildEventTitle(application.name, evaluation),
              userRef: normalized.userRef,
              department: normalized.userDepartment || normalized.dataType,
              model: normalized.modelName,
              environment,
              score: evaluation.score,
              level: evaluation.level,
              action: evaluation.action,
              reviewStatus: evaluation.reviewRequired ? "pending_review" : "resolved",
              owner: evaluation.reviewRequired ? "Unassigned" : "AI RiskOps",
              sla: evaluation.level === "severe" ? "2 hours" : "8 hours",
              riskExplanation: buildRiskExplanation(evaluation),
              affectedAsset: normalized.dataType,
              recommendation: evaluation.recommendation,
              updatedAt: normalized.occurredAt,
              ruleMatches: {
                create: evaluation.findings.map((finding) => ({
                  id: `${riskEventId}-${finding.ruleId}`,
                  riskRuleId: finding.ruleId,
                })),
              },
              evidence: {
                create: evaluation.findings.map((finding, index) => ({
                  id: `${riskEventId}-evidence-${index + 1}`,
                  riskRuleId: finding.ruleId,
                  signal: `${finding.ruleName} in ${finding.location}`,
                  evidence: protectCapturedText(finding.evidence).value,
                  impact: `This signal contributed ${finding.score} base points and influenced the ${evaluation.level} classification.`,
                })),
              },
            },
          })
        : null;

      if (credential) {
        await tx.applicationCredential.update({
          where: { id: credential.id },
          data: { lastUsedAt: new Date() },
        });
      }

      await updateApplicationIngestionValidation({
        applicationId: application.id,
        hasCredential: Boolean(credential),
        prompt: normalized.prompt,
        output,
        ragContext: normalized.ragContext,
        toolCall: normalized.toolCall,
      }, tx);

      await tx.ingestionRequestAudit.create({
        data: auditData({
          context,
          status: "success",
          httpStatus: 201,
          applicationId: application.id,
          callLogId: createdCallLog.id,
          riskEventId,
          dataProtectionMode: protectedFields.mode,
          ...normalizedAuditMeta(normalized),
        }),
      });

      return { callLog: createdCallLog, riskEvent: createdRiskEvent };
    });

    return {
      ok: true,
      status: 201,
      duplicate: false,
      data: {
        ingestion: {
          ...ingestionMeta(context, normalized, application.id),
          duplicate: false,
          policy: { templateId: policy.templateId, activeRuleIds: policy.activeRuleIds },
          dataProtection: dataProtectionMeta(protectedFields.findings),
        },
        callLog,
        riskEvent,
        evaluation,
      },
    };
  } catch (error) {
    // A concurrent request with the same trace ID won the unique constraint.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExistingCall(application.id, normalized.traceId);

      if (existing) {
        return duplicateOutcome(context, normalized, existing);
      }
    }

    console.error("Model call ingestion failed", error);

    return reject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Ingestion failed and no data was written. Retry with the same trace ID.",
    }, application.id);
  }
}
