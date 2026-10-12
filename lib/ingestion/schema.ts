import { randomUUID } from "crypto";
import { z } from "zod";
import {
  dataTypes,
  ingestionContractVersion,
  ingestionSources,
  isIngestionSource,
  type IngestionDataType,
  type IngestionSource,
} from "@/lib/api/ingestion-contract";

export const maxTextFieldLength = 8000;
export const maxBatchSize = 100;

const maxLabelLength = 200;

function text(max: number) {
  return z.string().trim().max(max).nullish().transform((value) => value ?? "");
}

function optionalEnum<const Values extends readonly [string, ...string[]]>(values: Values) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(values).nullish(),
  );
}

const label = () => text(maxLabelLength);
const captured = () => text(maxTextFieldLength);

const modelCallSchema = z.object({
  contractVersion: label(),
  ingestionSource: optionalEnum(ingestionSources),
  application: z.object({ id: label(), name: label(), slug: label() }).nullish(),
  request: z.object({
    traceId: label(),
    sessionId: label(),
    occurredAt: z.iso.datetime({ offset: true }).nullish(),
  }).nullish(),
  user: z.object({ id: label(), role: label(), department: label() }).nullish(),
  model: z.union([z.string().trim().max(maxLabelLength), z.object({ provider: label(), name: label() })]).nullish(),
  environment: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value),
    z.enum(["production", "test"]).nullish(),
  ),
  content: z.object({ prompt: captured(), output: captured() }).nullish(),
  context: z.object({ ragContext: captured(), dataType: optionalEnum(dataTypes) }).nullish(),
  agent: z.object({ toolCall: captured(), toolName: label(), toolAction: label() }).nullish(),
  // Flat fields from the pre-contract payload shape.
  applicationId: label(),
  applicationName: label(),
  app: label(),
  userRef: label(),
  userRole: label(),
  dataType: optionalEnum(dataTypes),
  prompt: captured(),
  output: captured(),
  ragContext: captured(),
  toolCall: captured(),
  templateId: label(),
});

export const batchSchema = z.object({
  calls: z.array(z.unknown()).min(1).max(maxBatchSize),
});

export type NormalizedIngestion = {
  contractVersion: string;
  ingestionSource: IngestionSource;
  applicationId: string;
  applicationName: string;
  payloadApplicationId: string;
  traceId: string;
  hasClientTraceId: boolean;
  sessionId: string;
  occurredAt: Date;
  userRef: string;
  userRole: string;
  userDepartment: string;
  modelName: string;
  environment: "Production" | "Test";
  dataType: IngestionDataType;
  prompt: string;
  output: string;
  ragContext: string;
  toolCall: string;
  templateId: string;
};

export type IngestionValidationError = {
  code: "INVALID_JSON" | "VALIDATION_ERROR";
  message: string;
  details: Record<string, unknown>;
};

export type ParsedModelCall =
  | { ok: true; value: NormalizedIngestion }
  | { ok: false; error: IngestionValidationError };

function headerValue(headers: Headers, name: string) {
  return headers.get(name)?.trim() ?? "";
}

export function parseModelCall(
  raw: unknown,
  headers: Headers,
  options: { hasCredentialAuth: boolean },
): ParsedModelCall {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be a valid JSON object.",
        details: { body: "invalid_json" },
      },
    };
  }

  const parsed = modelCallSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body failed validation.",
        details: {
          issues: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
          maxTextFieldLength,
        },
      },
    };
  }

  const body = parsed.data;
  const payloadApplicationId = body.applicationId || body.application?.id || "";
  const applicationName = body.applicationName || body.application?.name || body.application?.slug || body.app;
  const prompt = body.content?.prompt || body.prompt;
  const output = body.content?.output || body.output;
  const ragContext = body.context?.ragContext || body.ragContext;
  const toolCall = body.agent?.toolCall || body.agent?.toolName || body.toolCall;

  if (!payloadApplicationId && !applicationName && !options.hasCredentialAuth) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Application identifier is required.",
        details: { required: ["Authorization: Bearer <application_api_key>", "applicationId or applicationName"] },
      },
    };
  }

  if (!prompt && !output && !ragContext && !toolCall) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "At least one captured AI call field is required.",
        details: { requiredAnyOf: ["prompt", "output", "ragContext", "toolCall"] },
      },
    };
  }

  const headerSource = headerValue(headers, "x-ai-riskops-source");
  const clientTraceId = body.request?.traceId || headerValue(headers, "x-ai-riskops-trace-id");
  const modelName = typeof body.model === "string" ? body.model : body.model?.name;

  return {
    ok: true,
    value: {
      contractVersion: body.contractVersion || headerValue(headers, "x-ai-riskops-contract-version") || ingestionContractVersion,
      ingestionSource: body.ingestionSource ?? (isIngestionSource(headerSource) ? headerSource : "sdk"),
      applicationId: payloadApplicationId || headerValue(headers, "x-ai-riskops-application-id"),
      applicationName,
      payloadApplicationId,
      traceId: clientTraceId || `trace-${randomUUID()}`,
      hasClientTraceId: Boolean(clientTraceId),
      sessionId: body.request?.sessionId ?? "",
      occurredAt: body.request?.occurredAt ? new Date(body.request.occurredAt) : new Date(),
      userRef: body.user?.id || body.userRef || body.userRole || "Unknown User",
      userRole: body.user?.role || body.userRole || body.userRef || "Unknown User",
      userDepartment: body.user?.department ?? "",
      modelName: modelName || "gpt-4.1",
      environment: body.environment === "test" ? "Test" : "Production",
      dataType: body.context?.dataType ?? body.dataType ?? "General Data",
      prompt,
      output,
      ragContext,
      toolCall,
      templateId: body.templateId || "api-ingestion",
    },
  };
}

// Best-effort metadata for auditing requests that fail before normalization.
export function auditMetaFromRaw(raw: unknown, headers: Headers) {
  const body = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nested = (key: string) => (body[key] !== null && typeof body[key] === "object" ? body[key] : {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, maxLabelLength) : "");
  const source = str(body.ingestionSource);
  const headerSource = headerValue(headers, "x-ai-riskops-source");

  return {
    traceId: str(nested("request").traceId) || headerValue(headers, "x-ai-riskops-trace-id") || null,
    sessionId: str(nested("request").sessionId) || null,
    model: str(body.model) || str(nested("model").name) || null,
    environment: str(body.environment).toLowerCase() || null,
    ingestionSource: isIngestionSource(source) ? source : isIngestionSource(headerSource) ? headerSource : "sdk" as IngestionSource,
  };
}
