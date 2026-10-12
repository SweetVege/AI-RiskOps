import { average, percentage, severityRank } from "@/lib/api/overview";
import { scopedCallLogWhere, scopedRiskEventWhere, type RequestScope } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export type AnalyticsFilters = {
  applicationId: string | null;
  level: string | null;
  environment: string | null;
  action: string | null;
};

export type AnalyticsDrilldownType =
  | "application"
  | "category"
  | "rule"
  | "environment"
  | "department"
  | "data"
  | "model"
  | "user";

export type AnalyticsDrilldownRequest = {
  type: AnalyticsDrilldownType | null;
  label: string | null;
};

type AnalyticsRiskEvent = Awaited<ReturnType<typeof loadAnalyticsDataset>>["riskEvents"][number];
type CallLogSegment = {
  key: string;
  label: string;
  callLogs: number;
  blockedCalls: number;
};

type CallLogDimension = "application" | "environment" | "user" | "model";

// Call logs are the high-volume table, so analytics only ever sees them as grouped counts.
export type CallLogStats = {
  total: number;
  blocked: number;
  segments: Record<CallLogDimension, CallLogSegment[]>;
};

type DriverBucket = {
  id: string;
  label: string;
  detail: string;
  weightedScore: number;
  riskEvents: number;
  highSevereEvents: number;
  blockedEvents: number;
  callLogs: number;
  blockedCalls: number;
  totalRiskScore: number;
  mainDriverCounts: Record<string, number>;
};

export function analyticsFiltersFromSearchParams(searchParams: URLSearchParams): AnalyticsFilters {
  return {
    applicationId: searchParams.get("application_id"),
    level: searchParams.get("level"),
    environment: normalizeEnvironmentParam(searchParams.get("environment")),
    action: searchParams.get("action"),
  };
}

export function analyticsFilterResponse(filters: AnalyticsFilters) {
  return {
    applicationId: filters.applicationId,
    level: filters.level,
    environment: filters.environment,
    action: filters.action,
  };
}

export function analyticsDrilldownFromSearchParams(searchParams: URLSearchParams): AnalyticsDrilldownRequest {
  const type = searchParams.get("type");

  return {
    type: isAnalyticsDrilldownType(type) ? type : null,
    label: searchParams.get("label"),
  };
}

function analyticsWhere(filters: AnalyticsFilters) {
  return {
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.environment ? { environment: filters.environment } : {}),
    ...(filters.action ? { action: filters.action } : {}),
  };
}

async function loadRiskEvents(scope: RequestScope, filters: AnalyticsFilters) {
  return prisma.riskEvent.findMany({
    where: {
      ...scopedRiskEventWhere(scope, filters.applicationId),
      ...analyticsWhere(filters),
    },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      applicationId: true,
      occurredAt: true,
      title: true,
      userRef: true,
      department: true,
      model: true,
      environment: true,
      score: true,
      level: true,
      action: true,
      application: { select: { id: true, name: true, slug: true, ownerTeam: true } },
      ruleMatches: {
        select: {
          riskRuleId: true,
          riskRule: { select: { id: true, name: true, category: true } },
        },
      },
    },
  });
}

async function loadCallLogSegments(
  where: ReturnType<typeof scopedCallLogWhere>,
  column: "applicationId" | "environment" | "userRef" | "model",
  label: (key: string) => string,
): Promise<CallLogSegment[]> {
  const groups = await prisma.aiCallLog.groupBy({
    by: [column, "action"],
    where,
    _count: { _all: true },
  });
  const segments = new Map<string, CallLogSegment>();

  for (const group of groups) {
    const key = group[column];
    const segment = segments.get(key) ?? { key, label: label(key), callLogs: 0, blockedCalls: 0 };

    segment.callLogs += group._count._all;
    if (group.action === "block") segment.blockedCalls += group._count._all;
    segments.set(key, segment);
  }

  return [...segments.values()].sort((a, b) => b.callLogs - a.callLogs || a.key.localeCompare(b.key));
}

async function loadCallLogStats(scope: RequestScope, filters: AnalyticsFilters): Promise<CallLogStats> {
  const where = {
    ...scopedCallLogWhere(scope, filters.applicationId),
    ...analyticsWhere(filters),
  };
  const applications = await prisma.application.findMany({ select: { id: true, name: true } });
  const applicationNames = new Map(applications.map((application) => [application.id, application.name]));
  const [application, environment, user, model] = await Promise.all([
    loadCallLogSegments(where, "applicationId", (key) => applicationNames.get(key) ?? key),
    loadCallLogSegments(where, "environment", titleCase),
    loadCallLogSegments(where, "userRef", (key) => key),
    loadCallLogSegments(where, "model", (key) => key),
  ]);

  return {
    total: environment.reduce((sum, segment) => sum + segment.callLogs, 0),
    blocked: environment.reduce((sum, segment) => sum + segment.blockedCalls, 0),
    segments: { application, environment, user, model },
  };
}

export async function loadAnalyticsDataset(scope: RequestScope, filters: AnalyticsFilters) {
  const [riskEvents, callLogs] = await Promise.all([
    loadRiskEvents(scope, filters),
    loadCallLogStats(scope, filters),
  ]);

  return { riskEvents, callLogs };
}

export function analyticsSummary(riskEvents: AnalyticsRiskEvent[], callLogs: CallLogStats) {
  const highSevereEvents = riskEvents.filter((event) => isHighSevere(event.level)).length;
  const blockedCalls = callLogs.blocked;

  return {
    riskEvents: riskEvents.length,
    modelCalls: callLogs.total,
    highSevereEvents,
    highSevereRate: percentage(highSevereEvents, riskEvents.length),
    riskEventRate: percentage(riskEvents.length, callLogs.total),
    blockRate: percentage(blockedCalls, callLogs.total),
    averageRiskScore: average(riskEvents.map((event) => event.score)),
    blockedModelCalls: blockedCalls,
  };
}

export function analyticsDrivers(riskEvents: AnalyticsRiskEvent[], callLogs: CallLogStats) {
  return {
    applications: applicationDrivers(riskEvents, callLogs),
    categories: categoryDrivers(riskEvents),
    rules: ruleDrivers(riskEvents),
    environments: eventDrivers(riskEvents, {
      getEventKey: (event) => event.environment,
      getEventLabel: (event) => titleCase(event.environment),
      segments: callLogs.segments.environment,
      detail: "Environment risk concentration",
    }),
    departments: eventDrivers(riskEvents, {
      getEventKey: (event) => event.department,
      getEventLabel: (event) => event.department,
      detail: "Department or data segment",
    }),
    users: eventDrivers(riskEvents, {
      getEventKey: (event) => event.userRef,
      getEventLabel: (event) => event.userRef,
      segments: callLogs.segments.user,
      detail: "User or role segment",
    }),
    models: eventDrivers(riskEvents, {
      getEventKey: (event) => event.model,
      getEventLabel: (event) => event.model,
      segments: callLogs.segments.model,
      detail: "Model segment",
    }),
  };
}

export function applicationAnalytics(
  application: {
    id: string;
    name: string;
    ownerTeam: string;
    status: string;
    fieldCoverage: number;
  },
  riskEvents: AnalyticsRiskEvent[],
  callLogs: CallLogStats,
) {
  const summary = analyticsSummary(riskEvents, callLogs);
  const drivers = analyticsDrivers(riskEvents, callLogs);
  const maxRiskScore = riskEvents.reduce((max, event) => Math.max(max, event.score), 0);
  const recentHighRiskExamples = riskEvents
    .filter((event) => isHighSevere(event.level))
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      title: event.title,
      score: event.score,
      level: event.level,
      action: event.action,
      environment: event.environment,
      model: event.model,
      matchedRules: event.ruleMatches.map((match) => ({
        id: match.riskRule.id,
        name: match.riskRule.name,
        category: match.riskRule.category,
      })),
    }));
  const topCategory = drivers.categories[0];
  const topRule = drivers.rules[0];

  return {
    application: {
      id: application.id,
      name: application.name,
      ownerTeam: application.ownerTeam,
      status: application.status,
      fieldCoverage: application.fieldCoverage,
    },
    metrics: {
      ...summary,
      maxRiskScore,
      uniqueUsers: new Set(riskEvents.map((event) => event.userRef)).size,
      uniqueModels: new Set(riskEvents.map((event) => event.model)).size,
      uniqueRules: new Set(riskEvents.flatMap((event) => event.ruleMatches.map((match) => match.riskRuleId))).size,
    },
    driverMix: {
      categories: drivers.categories,
      environments: drivers.environments,
      rules: drivers.rules,
    },
    recentHighRiskExamples,
    insight: riskEvents.length
      ? `${application.name} contributes ${riskEvents.length} risk events in the current scope. Its main pressure comes from ${topCategory?.label ?? "mixed categories"}, with ${topRule?.label ?? "multiple matched rules"} as the leading evidence signal. Prioritize follow-up where high-severity events repeat across the same category, rule, or environment.`
      : `${application.name} has no risk events in the current analytics scope.`,
  };
}

export function analyticsDrilldown(
  riskEvents: AnalyticsRiskEvent[],
  drilldown: AnalyticsDrilldownRequest,
) {
  const scopedEvents = filterEventsByDrilldown(riskEvents, drilldown);
  const highSevereEvents = scopedEvents.filter((event) => isHighSevere(event.level)).length;
  const topEvent = scopedEvents.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  const topApplication = topCount(
    scopedEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.application.name] = (counts[event.application.name] ?? 0) + 1;
      return counts;
    }, {}),
  );
  const topRule = topCount(
    scopedEvents.reduce<Record<string, number>>((counts, event) => {
      for (const match of event.ruleMatches) {
        counts[match.riskRuleId] = (counts[match.riskRuleId] ?? 0) + 1;
      }
      return counts;
    }, {}),
  );
  const topCategory = topCount(
    scopedEvents.reduce<Record<string, number>>((counts, event) => {
      for (const match of event.ruleMatches) {
        counts[match.riskRule.category] = (counts[match.riskRule.category] ?? 0) + 1;
      }
      return counts;
    }, {}),
  );

  return {
    drilldown: {
      type: drilldown.type,
      label: drilldown.label,
    },
    summary: {
      riskEvents: scopedEvents.length,
      highSevereEvents,
      highSevereRate: percentage(highSevereEvents, scopedEvents.length),
      averageRiskScore: average(scopedEvents.map((event) => event.score)),
      maxRiskScore: topEvent?.score ?? 0,
      topApplication,
      topCategory,
      topRule,
    },
    topEvent: topEvent ? formatDrilldownEvent(topEvent) : null,
    events: scopedEvents
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(formatDrilldownEvent),
    insight: scopedEvents.length
      ? `${drilldown.label ?? "The current scope"} contains ${scopedEvents.length} risk events, with ${percentage(highSevereEvents, scopedEvents.length)}% High+Severe concentration. The strongest signal is ${topEvent?.title ?? "mixed evidence"}, led by ${topCategory ?? "mixed categories"} and ${topRule ?? "multiple rules"}.`
      : `${drilldown.label ?? "The current scope"} has no matching risk events in the current analytics scope.`,
  };
}

function applicationDrivers(riskEvents: AnalyticsRiskEvent[], callLogs: CallLogStats) {
  return eventDrivers(riskEvents, {
    getEventKey: (event) => event.applicationId,
    getEventLabel: (event) => event.application.name,
    getEventDetail: (event) => event.application.ownerTeam,
    segments: callLogs.segments.application,
    detail: "Application risk pressure",
  });
}

function categoryDrivers(riskEvents: AnalyticsRiskEvent[]) {
  const buckets = new Map<string, DriverBucket>();

  for (const event of riskEvents) {
    for (const match of event.ruleMatches) {
      const bucket = getBucket(buckets, match.riskRule.category, match.riskRule.category, "Weighted by matched event severity");
      addEventToBucket(bucket, event, match.riskRule.id);
    }
  }

  return finalizeBuckets(buckets);
}

function ruleDrivers(riskEvents: AnalyticsRiskEvent[]) {
  const buckets = new Map<string, DriverBucket>();

  for (const event of riskEvents) {
    for (const match of event.ruleMatches) {
      const bucket = getBucket(buckets, match.riskRule.id, match.riskRule.id, match.riskRule.name);
      addEventToBucket(bucket, event, match.riskRule.category);
    }
  }

  return finalizeBuckets(buckets);
}

function eventDrivers(
  riskEvents: AnalyticsRiskEvent[],
  config: {
    getEventKey: (event: AnalyticsRiskEvent) => string;
    getEventLabel: (event: AnalyticsRiskEvent) => string;
    getEventDetail?: (event: AnalyticsRiskEvent) => string;
    segments?: CallLogSegment[];
    detail: string;
  },
) {
  const buckets = new Map<string, DriverBucket>();

  for (const event of riskEvents) {
    const key = config.getEventKey(event);
    const bucket = getBucket(buckets, key, config.getEventLabel(event), config.getEventDetail?.(event) ?? config.detail);
    const mainRule = event.ruleMatches[0]?.riskRule.id ?? event.level;
    addEventToBucket(bucket, event, mainRule);
  }

  for (const segment of config.segments ?? []) {
    const bucket = getBucket(buckets, segment.key, segment.label, config.detail);
    bucket.callLogs += segment.callLogs;
    bucket.blockedCalls += segment.blockedCalls;
  }

  return finalizeBuckets(buckets);
}

function filterEventsByDrilldown(
  riskEvents: AnalyticsRiskEvent[],
  drilldown: AnalyticsDrilldownRequest,
) {
  if (!drilldown.type || !drilldown.label) return riskEvents;
  const label = drilldown.label;

  return riskEvents.filter((event) => {
    if (drilldown.type === "application") return event.application.name === label || event.applicationId === label;
    if (drilldown.type === "category") return event.ruleMatches.some((match) => match.riskRule.category === label);
    if (drilldown.type === "rule") return event.ruleMatches.some((match) => match.riskRuleId === label);
    if (drilldown.type === "environment") return titleCase(event.environment) === label || event.environment === label.toLowerCase();
    if (drilldown.type === "department" || drilldown.type === "data") return event.department === label;
    if (drilldown.type === "model") return event.model === label;
    if (drilldown.type === "user") return event.userRef === label;
    return true;
  });
}

function formatDrilldownEvent(event: AnalyticsRiskEvent) {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    application: {
      id: event.application.id,
      name: event.application.name,
      slug: event.application.slug,
    },
    title: event.title,
    score: event.score,
    level: event.level,
    action: event.action,
    environment: titleCase(event.environment),
    model: event.model,
    userRef: event.userRef,
    department: event.department,
    matchedRules: event.ruleMatches.map((match) => ({
      id: match.riskRule.id,
      name: match.riskRule.name,
      category: match.riskRule.category,
    })),
  };
}

function getBucket(buckets: Map<string, DriverBucket>, id: string, label: string, detail: string) {
  const existing = buckets.get(id);
  if (existing) return existing;

  const bucket: DriverBucket = {
    id,
    label,
    detail,
    weightedScore: 0,
    riskEvents: 0,
    highSevereEvents: 0,
    blockedEvents: 0,
    callLogs: 0,
    blockedCalls: 0,
    totalRiskScore: 0,
    mainDriverCounts: {},
  };

  buckets.set(id, bucket);
  return bucket;
}

function addEventToBucket(bucket: DriverBucket, event: AnalyticsRiskEvent, mainDriver: string) {
  bucket.weightedScore += severityRank(event.level);
  bucket.riskEvents += 1;
  bucket.totalRiskScore += event.score;
  if (isHighSevere(event.level)) bucket.highSevereEvents += 1;
  if (event.action === "block") bucket.blockedEvents += 1;
  bucket.mainDriverCounts[mainDriver] = (bucket.mainDriverCounts[mainDriver] ?? 0) + 1;
}

function finalizeBuckets(buckets: Map<string, DriverBucket>) {
  const totalWeightedScore = [...buckets.values()].reduce((sum, bucket) => sum + bucket.weightedScore, 0);

  return [...buckets.values()]
    .map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      detail: bucket.detail,
      contribution: percentage(bucket.weightedScore, totalWeightedScore),
      weightedScore: bucket.weightedScore,
      riskEvents: bucket.riskEvents,
      highSevereEvents: bucket.highSevereEvents,
      highSevereRate: percentage(bucket.highSevereEvents, bucket.riskEvents),
      averageRiskScore: averageScore(bucket.totalRiskScore, bucket.riskEvents),
      blockRate: percentage(bucket.blockedCalls || bucket.blockedEvents, bucket.callLogs || bucket.riskEvents),
      mainDriver: topCount(bucket.mainDriverCounts),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 10);
}

function averageScore(total: number, count: number) {
  return count ? Math.round((total / count) * 10) / 10 : 0;
}

function isHighSevere(level: string) {
  return level === "high" || level === "severe";
}

function normalizeEnvironmentParam(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "production" || normalized === "test") return normalized;
  return value;
}

function titleCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function topCount(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function isAnalyticsDrilldownType(value: string | null): value is AnalyticsDrilldownType {
  return (
    value === "application" ||
    value === "category" ||
    value === "rule" ||
    value === "environment" ||
    value === "department" ||
    value === "data" ||
    value === "model" ||
    value === "user"
  );
}
