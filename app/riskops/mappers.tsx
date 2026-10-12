import {
  type ApplicationDetailApi,
  type ApplicationListItemApi,
  type ApplicationRecentRiskEventApi,
  type CallLogDetailApi,
  type CallLogLinkedRiskEventApi,
  type CallLogListItemApi,
  type RiskEventDetailApi,
  type RiskEventListItemApi,
} from "@/app/riskops/api-types";
import { type ConnectedApp, type UserProfile } from "@/app/riskops/config";
import { type AiCallLog, type RiskEvent } from "@/lib/risk-data";

export function profileQueryValue(profile: UserProfile) {
  return profile.toLowerCase().replaceAll(" ", "-");
}

export function formatApiTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatApiDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function normalizeEnvironment(value: string): RiskEvent["environment"] {
  return value.toLowerCase() === "test" ? "Test" : "Production";
}

export function mapRiskEventListItem(item: RiskEventListItemApi): RiskEvent {
  return {
    id: item.id,
    time: formatApiTime(item.occurredAt),
    app: item.application.name,
    user: item.userRef,
    department: item.department,
    model: item.model,
    environment: normalizeEnvironment(item.environment),
    score: item.score,
    level: item.level,
    action: item.action,
    rules: item.matchedRules.map((rule) => rule.id),
    title: item.title,
    prompt: "Open the event detail to load source prompt.",
    output: "Open the event detail to load model output.",
    evidence: item.evidenceCount ? [`${item.evidenceCount} evidence items available`] : [],
    affectedAsset: item.affectedAsset ?? undefined,
    recommendation: "Open the event detail to load recommended action.",
    reviewStatus: item.reviewStatus,
    owner: item.owner,
    sla: item.sla,
    updatedAt: formatApiDateTime(item.updatedAt),
  };
}

export function mapRiskEventDetail(item: RiskEventDetailApi): RiskEvent {
  const sourceCall = item.callLogs[0];

  return {
    ...mapRiskEventListItem(item),
    prompt: sourceCall?.prompt ?? "No source prompt captured.",
    output: sourceCall?.output ?? "No model output captured.",
    toolCall: sourceCall?.toolCall ?? undefined,
    evidence: item.evidence.map((evidence) => evidence.evidence),
    riskExplanation: item.riskExplanation,
    recommendation: item.recommendation,
    evidenceMappings: item.evidence.map((evidence) => ({
      ruleId: evidence.riskRuleId ?? "UNMAPPED",
      signal: evidence.signal,
      evidence: evidence.evidence,
      impact: evidence.impact,
    })),
  };
}

export function mapCallLogListItem(item: CallLogListItemApi): AiCallLog {
  return {
    id: item.id,
    traceId: item.traceId,
    eventId: item.linkedRiskEvent?.id,
    time: formatApiTime(item.occurredAt),
    app: item.application.name,
    user: item.userRef,
    model: item.model,
    environment: normalizeEnvironment(item.environment),
    score: item.score,
    level: item.level,
    action: item.action,
    prompt: item.promptPreview,
    output: item.outputPreview,
    ragContext: item.ragContextPreview,
    toolCall: item.toolCall ?? undefined,
    rules: item.linkedRiskEvent?.matchedRules.map((rule) => rule.id) ?? [],
  };
}

export function mapCallLogDetail(item: CallLogDetailApi): AiCallLog {
  return {
    ...mapCallLogListItem({
      ...item,
      promptPreview: item.prompt,
      outputPreview: item.output,
      ragContextPreview: item.ragContext,
    }),
    prompt: item.prompt,
    output: item.output,
    ragContext: item.ragContext,
  };
}

export function mapLinkedRiskEvent(
  item: CallLogLinkedRiskEventApi,
  log: CallLogDetailApi,
): RiskEvent {
  return {
    id: item.id,
    time: item.occurredAt ? formatApiTime(item.occurredAt) : formatApiTime(log.occurredAt),
    app: item.application?.name ?? log.application.name,
    user: item.userRef ?? log.userRef,
    department: item.department ?? "Linked risk event",
    model: log.model,
    environment: normalizeEnvironment(log.environment),
    score: item.score,
    level: item.level,
    action: item.action,
    rules: item.matchedRules.map((rule) => rule.id),
    title: item.title,
    prompt: log.prompt,
    output: log.output,
    evidence: item.evidence?.map((evidence) => evidence.evidence) ?? [],
    riskExplanation: item.riskExplanation,
    affectedAsset: item.affectedAsset ?? undefined,
    evidenceMappings: item.evidence?.map((evidence) => ({
      ruleId: evidence.riskRuleId ?? "UNMAPPED",
      signal: evidence.signal,
      evidence: evidence.evidence,
      impact: evidence.impact,
    })),
    recommendation: item.recommendation ?? "Open the linked risk event for recommended action.",
    reviewStatus: item.reviewStatus,
    owner: item.owner ?? "AI RiskOps",
    sla: item.sla ?? "N/A",
    updatedAt: item.occurredAt ? formatApiDateTime(item.occurredAt) : formatApiDateTime(log.occurredAt),
    toolCall: log.toolCall ?? undefined,
  };
}

export function titleCaseStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function mapApplicationStatus(value: string) {
  const statusMap: Record<string, string> = {
    connected: "Connected",
    validating: "Validating",
    pending_validation: "Pending Validation",
    not_connected: "Not Connected",
  };
  return statusMap[value] ?? titleCaseStatus(value);
}

export function mapIntegrationMethod(value: string) {
  const methodMap: Record<string, string> = {
    proxy: "OpenAI-compatible Proxy",
    sdk: "SDK Integration",
    log_ingestion: "Log Ingestion API",
    agent_tool_audit: "Agent Tool Audit",
  };
  return methodMap[value] ?? titleCaseStatus(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatLastSeen(value: string | null) {
  return value ? formatApiDateTime(value) : "Not seen";
}

export function levelFromScore(score: number): RiskEvent["level"] {
  if (score >= 80) return "severe";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export function mapApplicationRecentRiskEvent(
  item: ApplicationRecentRiskEventApi,
  app: ApplicationDetailApi,
): RiskEvent {
  return {
    id: item.id,
    time: formatApiTime(item.occurredAt),
    app: app.name,
    user: "Application risk inventory",
    department: app.ownerTeam,
    model: "N/A",
    environment: "Production",
    score: item.score,
    level: item.level,
    action: item.action,
    rules: item.matchedRules.map((rule) => rule.id),
    title: item.title,
    prompt: "Open Risk Events to inspect source prompt.",
    output: "Open Risk Events to inspect model output.",
    evidence: [],
    recommendation: "Open the linked risk event for recommended action.",
    reviewStatus: item.reviewStatus,
    owner: app.ownerTeam,
    sla: "N/A",
    updatedAt: formatApiDateTime(item.occurredAt),
  };
}

export function mapApplicationItem(item: ApplicationListItemApi | ApplicationDetailApi): ConnectedApp {
  const productionEnvironment = item.environments.find((environment) => environment.name === "production");
  const latestSeenAt =
    item.metrics.latestEventAt ??
    item.environments
      .map((environment) => environment.lastSeenAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
    null;

  return {
    id: item.id,
    name: item.name,
    status: mapApplicationStatus(item.status),
    policy: item.policyTemplate?.name ?? "No Policy Bound",
    integration: mapIntegrationMethod(item.integrationMethod),
    owner: item.ownerTeam,
    appId: item.slug,
    environments: item.environments.map((environment) => ({
      name: titleCaseStatus(environment.name),
      status: mapApplicationStatus(environment.status),
      callsToday: formatNumber(environment.callsToday),
      lastSeen: formatLastSeen(environment.lastSeenAt),
    })),
    fieldCoverage: item.fieldCoverage,
    validation: item.validationChecks.map((check) => ({
      label: check.label,
      done: check.status === "passed",
    })),
    callsToday: formatNumber(productionEnvironment?.callsToday ?? item.metrics.callLogCount),
    eventsToday: item.metrics.riskEventCount,
    lastSeen: formatLastSeen(latestSeenAt),
    riskMetrics: {
      callLogCount: item.metrics.callLogCount,
      riskEventCount: item.metrics.riskEventCount,
      severeCount: item.metrics.severeCount,
      highCount: item.metrics.highCount,
      maxRiskScore: item.metrics.maxRiskScore ?? 0,
      latestEventAt: item.metrics.latestEventAt,
    },
    recentRiskEvents:
      "recentRiskEvents" in item
        ? item.recentRiskEvents.map((event) => mapApplicationRecentRiskEvent(event, item))
        : undefined,
  };
}
