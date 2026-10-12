export const ingestionContractVersion = "2026-08-06.v1";

export const ingestionSources = ["gateway_proxy", "sdk", "log_api", "agent_tool_audit"] as const;

export type IngestionSource = (typeof ingestionSources)[number];

export const dataTypes = ["Customer Data", "Financial Data", "Employee Data", "General Data"] as const;

export type IngestionDataType = (typeof dataTypes)[number];

export type ProductionModelCallIngestionBody = {
  contractVersion?: string;
  ingestionSource?: IngestionSource;
  application?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  request?: {
    id?: string;
    traceId?: string;
    sessionId?: string;
    occurredAt?: string;
  };
  user?: {
    id?: string;
    role?: string;
    department?: string;
  };
  model?: {
    provider?: string;
    name?: string;
  } | string;
  content?: {
    prompt?: string;
    output?: string;
  };
  context?: {
    ragContext?: string;
    dataType?: IngestionDataType;
  };
  agent?: {
    toolCall?: string;
    toolName?: string;
    toolAction?: string;
  };
  environment?: "Production" | "Test" | "production" | "test";
};

export const ingestionContract = {
  version: ingestionContractVersion,
  endpoint: "POST /api/ingest/model-call",
  batchEndpoint: "POST /api/ingest/model-calls/batch",
  idempotency: {
    key: "application + request.traceId",
    behavior: "Resending a trace ID that was already stored returns 200 with the existing call log and duplicate: true; nothing is written twice.",
  },
  limits: {
    maxTextFieldLength: 8000,
    maxBatchSize: 100,
    rateLimit: "Per application credential per minute; exceeding it returns 429 with Retry-After.",
  },
  auth: {
    currentPrototype: "profile query parameter remains available for demo and admin simulation flows",
    productionTarget: "Authorization: Bearer <application_api_key>",
    behavior: "When a valid application API key is provided, AI RiskOps resolves the application from the credential and rejects payloads that specify a conflicting application.id.",
    supportedHeaders: [
      "Authorization",
      "x-ai-riskops-source",
      "x-ai-riskops-application-id",
      "x-ai-riskops-trace-id",
      "x-ai-riskops-contract-version",
    ],
  },
  dataProtection: {
    mode: "masked_storage_and_response",
    rawContentAvailable: false,
    protectedFields: ["content.prompt", "content.output", "context.ragContext", "agent.toolCall"],
    patterns: ["Email", "Phone Number", "Payment Card", "Bearer Token", "API Key", "Private Key", "Government ID"],
  },
  integrationMethods: [
    {
      source: "gateway_proxy",
      label: "OpenAI-compatible Gateway Proxy",
      purpose: "Centralize enforcement before and after model calls by routing traffic through AI RiskOps.",
      minimumFields: ["Authorization Bearer key", "request.traceId", "user.id or user.role", "model.name", "content.prompt"],
    },
    {
      source: "sdk",
      label: "SDK Integration",
      purpose: "Report prompts, outputs, RAG context, and tool calls directly from application code.",
      minimumFields: ["Authorization Bearer key", "user.id or user.role", "environment", "content.prompt or content.output"],
    },
    {
      source: "log_api",
      label: "Log Ingestion API",
      purpose: "Send model-call logs from an existing AI platform, gateway, or observability pipeline.",
      minimumFields: ["Authorization Bearer key", "request.occurredAt", "model.name", "content.prompt or content.output or context.ragContext"],
    },
    {
      source: "agent_tool_audit",
      label: "Agent Tool Audit",
      purpose: "Report high-risk agent tool calls such as export, delete, email, payment, or permission changes.",
      minimumFields: ["Authorization Bearer key", "user.id or user.role", "agent.toolCall or agent.toolName", "environment"],
    },
  ],
  payloadShape: {
    contractVersion: ingestionContractVersion,
    ingestionSource: "sdk",
    application: {
      id: "app-cs-copilot",
      name: "Customer Support Copilot",
    },
    request: {
      traceId: "trace-prod-001",
      sessionId: "session-001",
      occurredAt: "2026-08-06T10:00:00.000Z",
    },
    user: {
      id: "user_123",
      role: "Support Agent",
      department: "Customer Service",
    },
    model: {
      provider: "openai",
      name: "gpt-4.1",
    },
    environment: "Production",
    content: {
      prompt: "Summarize the latest customer complaint.",
      output: "The customer reported delayed invoices.",
    },
    context: {
      ragContext: "Customer support tickets and CRM notes.",
      dataType: "Customer Data",
    },
    agent: {
      toolCall: "export_customer_records(scope=enterprise)",
    },
  },
};

export function isIngestionSource(value: string): value is IngestionSource {
  return ingestionSources.includes(value as IngestionSource);
}

export function isIngestionDataType(value: string): value is IngestionDataType {
  return dataTypes.includes(value as IngestionDataType);
}
