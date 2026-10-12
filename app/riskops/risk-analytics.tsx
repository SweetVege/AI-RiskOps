import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AnalyticsDrilldown,
  type AnalyticsDrilldownApi,
  type AnalyticsDriver,
  AnalyticsDriverList,
  type AnalyticsDriversApi,
  type AnalyticsMetric,
  type AnalyticsSummaryApi,
  type ApplicationAnalyticsApi,
  type RiskEventDrillThroughFilters,
  SegmentBreakdown,
  analyticsMetricDescriptions,
  analyticsQueryString,
  formatAnalyticsPercent,
  mapAnalyticsDriver,
} from "@/app/riskops/analytics-shared";
import { type ApplicationListItemApi } from "@/app/riskops/api-types";
import { type ConnectedApp, type UserProfile } from "@/app/riskops/config";
import { mapApplicationItem, profileQueryValue } from "@/app/riskops/mappers";
import { categoryColorMap, fallbackCategoryColors } from "@/app/riskops/overview";
import { actionMeta, levelMeta } from "@/lib/risk-data";

export function RiskAnalytics({
  currentProfile,
  onOpenRiskEvents,
}: {
  currentProfile: UserProfile;
  onOpenRiskEvents: (filters: Omit<RiskEventDrillThroughFilters, "id">) => void;
}) {
  const [selectedMetric, setSelectedMetric] = useState<AnalyticsMetric>("High+Severe Rate");
  const [appFilter, setAppFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [environmentFilter, setEnvironmentFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  const [selectedDrilldown, setSelectedDrilldown] = useState<AnalyticsDrilldown | null>(null);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [analyticsSummaryData, setAnalyticsSummaryData] = useState<AnalyticsSummaryApi | null>(null);
  const [analyticsDriversData, setAnalyticsDriversData] = useState<AnalyticsDriversApi | null>(null);
  const [applicationAnalyticsData, setApplicationAnalyticsData] = useState<ApplicationAnalyticsApi | null>(null);
  const [drilldownAnalyticsData, setDrilldownAnalyticsData] = useState<AnalyticsDrilldownApi | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAnalyticsContext() {
      setIsLoading(true);
      setError(null);

      try {
        const profile = profileQueryValue(currentProfile);
        const appsResponse = await fetch(`/api/applications?profile=${profile}`, {
          signal: controller.signal,
        });

        if (!appsResponse.ok) {
          throw new Error("Unable to load analytics context.");
        }

        const appsPayload = await appsResponse.json() as { data: ApplicationListItemApi[] };
        setApps(appsPayload.data.map(mapApplicationItem));
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError("Unable to load Risk Analytics data from the backend APIs.");
          setApps([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadAnalyticsContext();

    return () => controller.abort();
  }, [currentProfile]);

  const appOptions = apps.map((app) => app.name);
  const selectedApplicationForFilter = appFilter !== "All" ? apps.find((app) => app.name === appFilter) : undefined;
  const hasActiveAnalyticsFilters =
    appFilter !== "All" || levelFilter !== "All" || environmentFilter !== "All" || actionFilter !== "All";
  const analyticsQuery = analyticsQueryString({
    profile: profileQueryValue(currentProfile),
    applicationId: selectedApplicationForFilter?.id,
    level: levelFilter !== "All" ? levelFilter : undefined,
    environment: environmentFilter !== "All" ? environmentFilter : undefined,
    action: actionFilter !== "All" ? actionFilter : undefined,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadBackendAnalytics() {
      setError(null);

      try {
        const [summaryResponse, driversResponse] = await Promise.all([
          fetch(`/api/analytics/summary?${analyticsQuery}`, { signal: controller.signal }),
          fetch(`/api/analytics/drivers?${analyticsQuery}`, { signal: controller.signal }),
        ]);

        if (!summaryResponse.ok || !driversResponse.ok) {
          throw new Error("Unable to load backend analytics.");
        }

        const [summaryPayload, driversPayload] = await Promise.all([
          summaryResponse.json() as Promise<{ data: AnalyticsSummaryApi }>,
          driversResponse.json() as Promise<{ data: AnalyticsDriversApi }>,
        ]);

        setAnalyticsSummaryData(summaryPayload.data);
        setAnalyticsDriversData(driversPayload.data);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setAnalyticsSummaryData(null);
          setAnalyticsDriversData(null);
          setError("Unable to load Risk Analytics data from the backend APIs.");
        }
      }
    }

    loadBackendAnalytics();

    return () => controller.abort();
  }, [analyticsQuery]);
  const metricValues: Record<AnalyticsMetric, string> = {
    "High+Severe Rate": `${analyticsSummaryData ? formatAnalyticsPercent(analyticsSummaryData.highSevereRate) : 0}%`,
    "Risk Event Rate": `${analyticsSummaryData ? formatAnalyticsPercent(analyticsSummaryData.riskEventRate) : 0}%`,
    "Block Rate": `${analyticsSummaryData ? formatAnalyticsPercent(analyticsSummaryData.blockRate) : 0}%`,
    "Average Risk Score": `${analyticsSummaryData?.averageRiskScore ?? 0}`,
  };
  const analyticsRiskEventCount = analyticsSummaryData?.riskEvents ?? 0;
  const analyticsModelCallCount = analyticsSummaryData?.modelCalls ?? 0;

  const applicationDrivers = analyticsDriversData?.applications.map((driver) => mapAnalyticsDriver(driver, "bg-sky-600")) ?? [];
  const categoryDrivers = analyticsDriversData?.categories.map((driver, index) => {
    const color = categoryColorMap[driver.label]?.tone ?? fallbackCategoryColors[index % fallbackCategoryColors.length].tone;
    return mapAnalyticsDriver(driver, color);
  }) ?? [];
  const ruleDrivers = analyticsDriversData?.rules.map((driver) => mapAnalyticsDriver(driver, "bg-violet-600")) ?? [];
  const environmentDrivers = analyticsDriversData?.environments.map((driver) => mapAnalyticsDriver(driver, "bg-emerald-600")) ?? [];
  const dataTypeDrivers = analyticsDriversData?.departments.map((driver) => mapAnalyticsDriver(driver, "bg-rose-600")) ?? [];
  const modelDrivers = analyticsDriversData?.models.map((driver) => mapAnalyticsDriver(driver, "bg-amber-500")) ?? [];
  const userDrivers = analyticsDriversData?.users.map((driver) => mapAnalyticsDriver(driver, "bg-violet-600")) ?? [];
  const topApp = applicationDrivers[0];
  const topCategory = categoryDrivers[0];
  const topRule = ruleDrivers[0];
  const coverageGaps = apps.filter((app) => app.fieldCoverage < 80 || app.status !== "Connected").length;
  const focusedApplicationName =
    selectedDrilldown?.type === "application"
      ? selectedDrilldown.label
      : appFilter !== "All"
        ? appFilter
        : topApp?.label;
  const focusedApplication = apps.find((app) => app.name === focusedApplicationName);
  const applicationAnalyticsQuery = analyticsQueryString({
    profile: profileQueryValue(currentProfile),
    level: levelFilter !== "All" ? levelFilter : undefined,
    environment: environmentFilter !== "All" ? environmentFilter : undefined,
    action: actionFilter !== "All" ? actionFilter : undefined,
  });
  const drilldownAnalyticsQuery = analyticsQueryString({
    profile: profileQueryValue(currentProfile),
    applicationId: selectedApplicationForFilter?.id,
    level: levelFilter !== "All" ? levelFilter : undefined,
    environment: environmentFilter !== "All" ? environmentFilter : undefined,
    action: actionFilter !== "All" ? actionFilter : undefined,
    type: selectedDrilldown?.type,
    label: selectedDrilldown?.label,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadApplicationAnalytics() {
      if (!focusedApplication?.id) {
        setApplicationAnalyticsData(null);
        return;
      }

      try {
        const response = await fetch(`/api/analytics/applications/${focusedApplication.id}?${applicationAnalyticsQuery}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load application analytics.");
        }

        const payload = await response.json() as { data: ApplicationAnalyticsApi };
        setApplicationAnalyticsData(payload.data);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setApplicationAnalyticsData(null);
        }
      }
    }

    loadApplicationAnalytics();

    return () => controller.abort();
  }, [focusedApplication?.id, applicationAnalyticsQuery]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDrilldownAnalytics() {
      try {
        const response = await fetch(`/api/analytics/drilldown?${drilldownAnalyticsQuery}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load drill-down analytics.");
        }

        const payload = await response.json() as { data: AnalyticsDrilldownApi };
        setDrilldownAnalyticsData(payload.data);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setDrilldownAnalyticsData(null);
        }
      }
    }

    loadDrilldownAnalytics();

    return () => controller.abort();
  }, [drilldownAnalyticsQuery]);

  const focusedCategoryDrivers = applicationAnalyticsData?.driverMix.categories.map((driver, index) => {
    const color = categoryColorMap[driver.label]?.tone ?? fallbackCategoryColors[index % fallbackCategoryColors.length].tone;
    return mapAnalyticsDriver(driver, color);
  }) ?? [];
  const focusedEnvironmentDrivers = applicationAnalyticsData?.driverMix.environments.map((driver) => mapAnalyticsDriver(driver, "bg-emerald-600")) ?? [];
  const focusedRecentSevereEvents = applicationAnalyticsData?.recentHighRiskExamples.map((event) => ({
    id: event.id,
    title: event.title,
    score: event.score,
    level: event.level,
    environment: event.environment,
    model: event.model,
    rules: event.matchedRules.map((rule) => rule.id),
  })) ?? [];
  const focusedMixSections: Array<{ label: string; drivers: AnalyticsDriver[] }> = [
    { label: "Category", drivers: focusedCategoryDrivers.slice(0, 4) },
    { label: "Environment", drivers: focusedEnvironmentDrivers.slice(0, 3) },
  ];
  const focusedInsight =
    applicationAnalyticsData?.insight ??
    (focusedApplicationName
      ? "Application analytics could not be loaded from the backend for this scope."
      : "Select an application driver to generate an application-level risk interpretation.");
  const focusedRiskEventCount = applicationAnalyticsData?.metrics.riskEvents ?? 0;
  const focusedHighSevereRate = applicationAnalyticsData ? formatAnalyticsPercent(applicationAnalyticsData.metrics.highSevereRate) : 0;
  const focusedBlockRate = applicationAnalyticsData ? formatAnalyticsPercent(applicationAnalyticsData.metrics.blockRate) : 0;
  const focusedAverageRiskScore = applicationAnalyticsData?.metrics.averageRiskScore ?? 0;
  const focusedMaxRiskScore = applicationAnalyticsData?.metrics.maxRiskScore ?? 0;
  const focusedUniqueUsers = applicationAnalyticsData?.metrics.uniqueUsers ?? 0;
  const focusedUniqueModels = applicationAnalyticsData?.metrics.uniqueModels ?? 0;
  const focusedUniqueRules = applicationAnalyticsData?.metrics.uniqueRules ?? 0;
  const drilldownEventRows = drilldownAnalyticsData?.events.map((event) => ({
    id: event.id,
    title: event.title,
    app: event.application.name,
    environment: event.environment,
    rules: event.matchedRules.map((rule) => rule.id),
    level: event.level,
    score: event.score,
  })) ?? [];
  const drilldownTopEventView = drilldownAnalyticsData?.topEvent
    ? {
        title: drilldownAnalyticsData.topEvent.title,
        score: drilldownAnalyticsData.topEvent.score,
        level: drilldownAnalyticsData.topEvent.level,
      }
    : null;
  const drilldownHighSevereRate = drilldownAnalyticsData ? formatAnalyticsPercent(drilldownAnalyticsData.summary.highSevereRate) : 0;
  const drilldownRiskEventCount = drilldownAnalyticsData?.summary.riskEvents ?? 0;
  const drilldownSummaryText = drilldownAnalyticsData?.insight ??
    (drilldownTopEventView
      ? `${drilldownTopEventView.title} is the highest-risk event in this view, with score ${drilldownTopEventView.score} and ${levelMeta[drilldownTopEventView.level].label} severity. Use this panel to validate whether the selected driver is concentrated in one application or spread across multiple contexts.`
      : "No risk events match the current filter and drill-down scope.");
  const buildRiskEventFilters = (): Omit<RiskEventDrillThroughFilters, "id"> => {
    const drilldownLabel = selectedDrilldown?.label;
    const targetAppName =
      selectedDrilldown?.type === "application" ? selectedDrilldown.label : appFilter !== "All" ? appFilter : undefined;
    const targetApplication = targetAppName ? apps.find((app) => app.name === targetAppName) : undefined;
    const targetEnvironment =
      selectedDrilldown?.type === "environment"
        ? selectedDrilldown.label
        : environmentFilter !== "All"
          ? environmentFilter
          : undefined;
    const q =
      selectedDrilldown?.type === "rule" ||
      selectedDrilldown?.type === "category" ||
      selectedDrilldown?.type === "data" ||
      selectedDrilldown?.type === "model" ||
      selectedDrilldown?.type === "user"
        ? selectedDrilldown.label
        : undefined;

    return {
      source: "Risk Analytics",
      label: drilldownLabel ?? "Current analytics filters",
      q,
      level: levelFilter !== "All" ? levelFilter : undefined,
      action: actionFilter !== "All" ? actionFilter : undefined,
      applicationId: targetApplication?.id,
      environment: targetEnvironment,
    };
  };
  const resetAnalyticsFilters = () => {
    setAppFilter("All");
    setLevelFilter("All");
    setEnvironmentFilter("All");
    setActionFilter("All");
    setSelectedDrilldown(null);
  };
  const exportAnalyticsReport = () => {
    if (typeof window === "undefined") return;

    const reportQuery = analyticsQueryString({
      profile: profileQueryValue(currentProfile),
      applicationId: selectedApplicationForFilter?.id,
      level: levelFilter !== "All" ? levelFilter : undefined,
      environment: environmentFilter !== "All" ? environmentFilter : undefined,
      action: actionFilter !== "All" ? actionFilter : undefined,
    });
    window.location.href = `/api/analytics/report?${reportQuery}&format=csv`;
  };

  return (
    <div className="space-y-5 p-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Analytics Filters</h2>
            <p className="mt-1 text-xs text-slate-500">
              Narrow the driver analysis before drilling into applications, rules, segments, or users
            </p>
          </div>
          <button
            type="button"
            onClick={resetAnalyticsFilters}
            disabled={!hasActiveAnalyticsFilters && !selectedDrilldown}
            className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={exportAnalyticsReport}
            className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          <label className="text-xs font-semibold text-slate-500">
            Application
            <select
              value={appFilter}
              onChange={(event) => {
                setAppFilter(event.target.value);
                setSelectedDrilldown(null);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky-300"
            >
              <option value="All">All Applications</option>
              {appOptions.map((app) => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Severity
            <select
              value={levelFilter}
              onChange={(event) => {
                setLevelFilter(event.target.value);
                setSelectedDrilldown(null);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky-300"
            >
              <option value="All">All Severities</option>
              <option value="severe">Severe</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Environment
            <select
              value={environmentFilter}
              onChange={(event) => {
                setEnvironmentFilter(event.target.value);
                setSelectedDrilldown(null);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky-300"
            >
              <option value="All">All Environments</option>
              <option value="Production">Production</option>
              <option value="Test">Test</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            System Action
            <select
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value);
                setSelectedDrilldown(null);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none focus:border-sky-300"
            >
              <option value="All">All Actions</option>
              {Object.entries(actionMeta).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {analyticsRiskEventCount} risk events
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {analyticsModelCallCount} model calls
          </span>
          {selectedDrilldown ? (
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              Drill-down: {selectedDrilldown.label}
            </span>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-4 gap-4">
        {(Object.keys(metricValues) as AnalyticsMetric[]).map((metric) => (
          <button
            key={metric}
            type="button"
            onClick={() => setSelectedMetric(metric)}
            className={`rounded-lg border p-4 text-left shadow-soft transition ${
              selectedMetric === metric ? "border-ink bg-white" : "border-line bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs font-semibold text-slate-500">{metric}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">
              {isLoading && !analyticsSummaryData ? "..." : metricValues[metric]}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{analyticsMetricDescriptions[metric]}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-[1.05fr_1fr_0.95fr] gap-5">
        <AnalyticsDriverList
          title="Application Drivers"
          drivers={applicationDrivers}
          drilldownType="application"
          selectedDrilldown={selectedDrilldown}
          onSelect={setSelectedDrilldown}
        />
        <AnalyticsDriverList
          title="Risk Category Drivers"
          drivers={categoryDrivers}
          drilldownType="category"
          selectedDrilldown={selectedDrilldown}
          onSelect={setSelectedDrilldown}
        />
        <AnalyticsDriverList
          title="Rule Drivers"
          drivers={ruleDrivers}
          drilldownType="rule"
          selectedDrilldown={selectedDrilldown}
          onSelect={setSelectedDrilldown}
        />
      </section>

      <section className="grid grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Top Driver Contribution</h2>
              <p className="mt-1 text-xs text-slate-500">
                Weighted contribution to current risk pressure by application, category, and rule
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {selectedMetric}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            {[
              { label: "Top Application", driver: topApp },
              { label: "Top Category", driver: topCategory },
              { label: "Top Rule", driver: topRule },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-panel p-4">
                <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                <p className="mt-2 min-h-10 text-lg font-semibold leading-5 text-ink">
                  {item.driver?.label ?? "No data"}
                </p>
                <p className="mt-3 text-3xl font-semibold text-ink">{item.driver?.percent ?? 0}%</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.driver?.detail ?? "No driver detected"}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4">
            <h3 className="text-sm font-semibold text-ink">Analysis Summary</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {topApp && topCategory && topRule
                ? `${selectedMetric} is primarily driven by ${topApp.label}, with ${topCategory.label} as the largest risk category and ${topRule.label} as the most material matched rule. Start investigation from this application, then inspect matching evidence and recent call logs for pattern changes.`
                : "There is not enough current-scope data to generate a driver summary."}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Suggested Investigation Path</h2>
          <div className="mt-4 space-y-3">
            {[
              ["1", topApp ? `Open ${topApp.label} in Applications and review its app-level risk profile.` : "Open Applications and select the highest-risk application."],
              ["2", topRule ? `Filter Risk Events by ${topRule.label} and inspect matched evidence.` : "Filter Risk Events by the most active matched rule."],
              ["3", "Compare Production vs Test and review data type or user role concentration."],
              ["4", `Check integration coverage gaps across ${coverageGaps} monitored applications before tuning policy.`],
            ].map(([step, text]) => (
              <div key={step} className="flex gap-3 rounded-lg border border-line bg-panel p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">
                  {step}
                </span>
                <p className="text-sm leading-6 text-slate-700">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Application Risk Drill-down</h2>
            <p className="mt-1 text-xs text-slate-500">
              {focusedApplicationName
                ? `Focused analysis for ${focusedApplicationName}`
                : "Select an application driver to inspect app-level risk posture"}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenRiskEvents({
                source: "Risk Analytics",
                label: focusedApplicationName ?? "Application drill-down",
                applicationId: focusedApplication?.id,
              })
            }
            disabled={!focusedApplicationName || !focusedRiskEventCount}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Events
          </button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-3">
          {[
            ["Risk Events", focusedRiskEventCount.toString()],
            ["High+Severe Rate", `${focusedHighSevereRate}%`],
            ["Block Rate", `${focusedBlockRate}%`],
            ["Avg Risk Score", focusedAverageRiskScore.toString()],
            ["Max Risk Score", focusedMaxRiskScore.toString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-panel p-3">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_1.1fr] gap-4">
          <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-700" />
              <h3 className="text-sm font-semibold text-ink">AI Insight</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{focusedInsight}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="font-semibold text-ink">{focusedUniqueUsers}</p>
                <p className="mt-1 text-slate-500">Users</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="font-semibold text-ink">{focusedUniqueModels}</p>
                <p className="mt-1 text-slate-500">Models</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="font-semibold text-ink">{focusedUniqueRules}</p>
                <p className="mt-1 text-slate-500">Rules</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-panel p-4">
            <h3 className="text-sm font-semibold text-ink">Application Driver Mix</h3>
            <div className="mt-3 space-y-4">
              {focusedMixSections.map(({ label, drivers }) => {
                const maxValue = Math.max(...drivers.map((driver) => driver.value), 1);

                return (
                  <div key={label}>
                    <p className="mb-2 text-xs font-semibold text-slate-500">{label}</p>
                    <div className="space-y-2">
                      {drivers.length ? drivers.map((driver) => (
                        <div key={`${label}-${driver.label}`} className="grid grid-cols-[104px_1fr_42px] items-center gap-3 text-xs">
                          <span className="truncate font-medium text-ink">{driver.label}</span>
                          <div className="h-2 rounded-full bg-white">
                            <div
                              className={`h-2 rounded-full ${driver.tone}`}
                              style={{ width: `${Math.max(8, (driver.value / maxValue) * 100)}%` }}
                            />
                          </div>
                          <span className="text-right font-semibold text-slate-600">{driver.percent}%</span>
                        </div>
                      )) : (
                        <p className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-500">No data</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Recent High-Risk Examples</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                Top {focusedRecentSevereEvents.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {focusedRecentSevereEvents.length ? focusedRecentSevereEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${levelMeta[event.level].className}`}>
                      {levelMeta[event.level].label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {event.environment} · {event.model} · {event.rules.join(", ")}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Score {event.score}</p>
                </div>
              )) : (
                <div className="grid h-36 place-items-center rounded-lg bg-white text-sm font-medium text-slate-500">
                  No high-risk examples in scope
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Drill-down Evidence</h2>
            <p className="mt-1 text-xs text-slate-500">
              {selectedDrilldown
                ? `Focused on ${selectedDrilldown.label} within the current filter scope`
                : "Select a driver above or use filters to inspect the strongest event signals"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenRiskEvents(buildRiskEventFilters())}
              disabled={!drilldownRiskEventCount}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open in Risk Events
            </button>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {drilldownRiskEventCount} events
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              {drilldownHighSevereRate}% High+Severe
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[0.9fr_1.1fr] gap-4">
          <div className="rounded-lg bg-panel p-4">
            <p className="text-xs font-semibold text-slate-500">Focused Summary</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {drilldownSummaryText}
            </p>
          </div>
          <div className="space-y-2">
            {drilldownEventRows.length ? drilldownEventRows.slice(0, 4).map((event) => (
              <div key={event.id} className="grid grid-cols-[1fr_92px_92px] items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{event.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {event.app} · {event.environment} · {event.rules.join(", ")}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${levelMeta[event.level].className}`}>
                  {levelMeta[event.level].label}
                </span>
                <span className="text-right text-xs font-semibold text-slate-600">Score {event.score}</span>
              </div>
            )) : (
              <div className="grid h-32 place-items-center rounded-lg bg-panel text-sm font-medium text-slate-500">
                No events match this scope
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-5">
        <SegmentBreakdown title="By Environment" drivers={environmentDrivers} />
        <SegmentBreakdown title="By Data Type" drivers={dataTypeDrivers} />
        <SegmentBreakdown title="By Model" drivers={modelDrivers} />
        <SegmentBreakdown title="By User / Role" drivers={userDrivers} />
      </section>
    </div>
  );
}
