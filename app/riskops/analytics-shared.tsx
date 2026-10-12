import { categoryColorMap, fallbackCategoryColors } from "@/app/riskops/overview";
import { type RiskEvent, riskRules } from "@/lib/risk-data";

export type AnalyticsMetric = "High+Severe Rate" | "Risk Event Rate" | "Block Rate" | "Average Risk Score";

export type AnalyticsDriver = {
  id?: string;
  label: string;
  detail: string;
  value: number;
  percent: number;
  tone: string;
};

export type AnalyticsDrilldown =
  | { type: "application"; label: string }
  | { type: "category"; label: string }
  | { type: "rule"; label: string }
  | { type: "environment"; label: string }
  | { type: "data"; label: string }
  | { type: "model"; label: string }
  | { type: "user"; label: string };

export type RiskEventDrillThroughFilters = {
  id: number;
  source: string;
  label: string;
  q?: string;
  level?: string;
  action?: string;
  applicationId?: string;
  environment?: string;
};

export type RiskEventSavedView = {
  id: string;
  name: string;
  q: string;
  level: string;
  action: string;
  reviewStatus: string;
  applicationId: string;
  environment: string;
  sourceLabel: string;
  createdAt: string;
};

export type AnalyticsSummaryApi = {
  riskEvents: number;
  modelCalls: number;
  highSevereEvents: number;
  highSevereRate: number;
  riskEventRate: number;
  blockRate: number;
  averageRiskScore: number;
  blockedModelCalls: number;
};

export type AnalyticsDriverApi = {
  id: string;
  label: string;
  detail: string;
  contribution: number;
  weightedScore: number;
  riskEvents: number;
  highSevereEvents: number;
  highSevereRate: number;
  averageRiskScore: number;
  blockRate: number;
  mainDriver: string | null;
};

export type AnalyticsDriversApi = {
  applications: AnalyticsDriverApi[];
  categories: AnalyticsDriverApi[];
  rules: AnalyticsDriverApi[];
  environments: AnalyticsDriverApi[];
  departments: AnalyticsDriverApi[];
  users: AnalyticsDriverApi[];
  models: AnalyticsDriverApi[];
};

export type ApplicationAnalyticsApi = {
  application: {
    id: string;
    name: string;
    ownerTeam: string;
    status: string;
    fieldCoverage: number;
  };
  metrics: AnalyticsSummaryApi & {
    maxRiskScore: number;
    uniqueUsers: number;
    uniqueModels: number;
    uniqueRules: number;
  };
  driverMix: {
    categories: AnalyticsDriverApi[];
    environments: AnalyticsDriverApi[];
    rules: AnalyticsDriverApi[];
  };
  recentHighRiskExamples: Array<{
    id: string;
    occurredAt: string;
    title: string;
    score: number;
    level: RiskEvent["level"];
    action: RiskEvent["action"];
    environment: string;
    model: string;
    matchedRules: Array<{
      id: string;
      name: string;
      category: string;
    }>;
  }>;
  insight: string;
};

export type AnalyticsDrilldownEventApi = {
  id: string;
  occurredAt: string;
  application: {
    id: string;
    name: string;
    slug: string;
  };
  title: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  environment: string;
  model: string;
  userRef: string;
  department: string;
  matchedRules: Array<{
    id: string;
    name: string;
    category: string;
  }>;
};

export type AnalyticsDrilldownApi = {
  drilldown: {
    type: string | null;
    label: string | null;
  };
  summary: {
    riskEvents: number;
    highSevereEvents: number;
    highSevereRate: number;
    averageRiskScore: number;
    maxRiskScore: number;
    topApplication: string | null;
    topCategory: string | null;
    topRule: string | null;
  };
  topEvent: AnalyticsDrilldownEventApi | null;
  events: AnalyticsDrilldownEventApi[];
  insight: string;
};

export const analyticsMetricDescriptions: Record<AnalyticsMetric, string> = {
  "High+Severe Rate": "Share of high and severe risk events among all risk events.",
  "Risk Event Rate": "Risk events divided by total model calls in the current scope.",
  "Block Rate": "Blocked model calls divided by total model calls in the current scope.",
  "Average Risk Score": "Average score of risk events generated in the current scope.",
};

export function percentValue(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export function levelWeight(level: RiskEvent["level"]) {
  return level === "severe" ? 4 : level === "high" ? 3 : level === "medium" ? 2 : 1;
}

export function makeDriver(label: string, value: number, total: number, detail: string, tone = "bg-sky-600"): AnalyticsDriver {
  return {
    label,
    value,
    percent: percentValue(value, total),
    detail,
    tone,
  };
}

export function formatAnalyticsPercent(value: number) {
  return Math.round(value);
}

export function analyticsQueryString(params: {
  profile: string;
  applicationId?: string;
  level?: string;
  environment?: string;
  action?: string;
  type?: string;
  label?: string;
}) {
  const searchParams = new URLSearchParams({ profile: params.profile });

  if (params.applicationId) searchParams.set("application_id", params.applicationId);
  if (params.level) searchParams.set("level", params.level);
  if (params.environment) searchParams.set("environment", params.environment);
  if (params.action) searchParams.set("action", params.action);
  if (params.type) searchParams.set("type", params.type);
  if (params.label) searchParams.set("label", params.label);

  return searchParams.toString();
}

export function mapAnalyticsDriver(driver: AnalyticsDriverApi, tone: string): AnalyticsDriver {
  return {
    id: driver.id,
    label: driver.label,
    detail: `${driver.riskEvents} events · ${driver.detail}`,
    value: driver.weightedScore,
    percent: formatAnalyticsPercent(driver.contribution),
    tone,
  };
}

export function driverBarsFromEvents(
  events: RiskEvent[],
  getKey: (event: RiskEvent) => string,
  getDetail: (event: RiskEvent) => string,
  tone: string,
) {
  const weighted = events.reduce<Record<string, { value: number; events: number; detail: string }>>((acc, event) => {
    const key = getKey(event);
    const current = acc[key] ?? { value: 0, events: 0, detail: getDetail(event) };
    current.value += levelWeight(event.level);
    current.events += 1;
    acc[key] = current;
    return acc;
  }, {});
  const total = Object.values(weighted).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(weighted)
    .map(([label, item]) => makeDriver(label, item.value, total, `${item.events} events · ${item.detail}`, tone))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function ruleDriversFromEvents(events: RiskEvent[]) {
  const counts = events.reduce<Record<string, number>>((acc, event) => {
    event.rules.forEach((ruleId) => {
      acc[ruleId] = (acc[ruleId] ?? 0) + levelWeight(event.level);
    });
    return acc;
  }, {});
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return Object.entries(counts)
    .map(([ruleId, value]) => {
      const rule = riskRules.find((item) => item.id === ruleId);
      return makeDriver(ruleId, value, total, rule?.name ?? "Unknown rule", "bg-violet-600");
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function categoryDriversFromEvents(events: RiskEvent[]) {
  const counts = events.reduce<Record<string, number>>((acc, event) => {
    event.rules.forEach((ruleId) => {
      const rule = riskRules.find((item) => item.id === ruleId);
      const category = rule?.category ?? "Other";
      acc[category] = (acc[category] ?? 0) + levelWeight(event.level);
    });
    return acc;
  }, {});
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return Object.entries(counts)
    .map(([category, value], index) => {
      const color = categoryColorMap[category]?.tone ?? fallbackCategoryColors[index % fallbackCategoryColors.length].tone;
      return makeDriver(category, value, total, "Weighted by event severity", color);
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function AnalyticsDriverList({
  title,
  drivers,
  drilldownType,
  selectedDrilldown,
  onSelect,
}: {
  title: string;
  drivers: AnalyticsDriver[];
  drilldownType: AnalyticsDrilldown["type"];
  selectedDrilldown: AnalyticsDrilldown | null;
  onSelect: (drilldown: AnalyticsDrilldown) => void;
}) {
  const maxValue = Math.max(...drivers.map((driver) => driver.value), 1);

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          Top {drivers.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {drivers.length ? drivers.map((driver) => (
          <button
            key={driver.label}
            type="button"
            onClick={() => onSelect({ type: drilldownType, label: driver.label })}
            className={`w-full rounded-lg p-2 text-left transition ${
              selectedDrilldown?.type === drilldownType && selectedDrilldown.label === driver.label
                ? "bg-sky-50 ring-1 ring-sky-200"
                : "hover:bg-slate-50"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{driver.label}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{driver.detail}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-600">{driver.percent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div
                className={`h-2.5 rounded-full ${driver.tone}`}
                style={{ width: `${Math.max(8, (driver.value / maxValue) * 100)}%` }}
              />
            </div>
          </button>
        )) : (
          <div className="grid h-32 place-items-center text-sm font-medium text-slate-500">No driver data</div>
        )}
      </div>
    </section>
  );
}

export function SegmentBreakdown({
  title,
  drivers,
}: {
  title: string;
  drivers: AnalyticsDriver[];
}) {
  const maxValue = Math.max(...drivers.map((driver) => driver.value), 1);

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {drivers.length ? drivers.map((driver) => (
          <div key={driver.label} className="grid grid-cols-[112px_1fr_42px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-ink">{driver.label}</span>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${driver.tone}`}
                style={{ width: `${Math.max(8, (driver.value / maxValue) * 100)}%` }}
              />
            </div>
            <span className="text-right font-semibold text-slate-600">{driver.value}</span>
          </div>
        )) : (
          <div className="grid h-28 place-items-center text-sm font-medium text-slate-500">No segment data</div>
        )}
      </div>
    </section>
  );
}
