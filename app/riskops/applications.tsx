import { Activity, AlertOctagon, ClipboardList, Code2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AnalyticsDriver,
  categoryDriversFromEvents,
  driverBarsFromEvents,
  ruleDriversFromEvents,
} from "@/app/riskops/analytics-shared";
import { apiRequest } from "@/app/riskops/api";
import { type ApplicationDetailApi, type ApplicationListItemApi } from "@/app/riskops/api-types";
import { StatCard } from "@/app/riskops/components";
import { type ConnectedApp, type UserProfile, riskLevelRank } from "@/app/riskops/config";
import {
  levelFromScore,
  mapApplicationItem,
  titleCaseStatus,
} from "@/app/riskops/mappers";
import { type RiskEvent, levelMeta, riskRules } from "@/lib/risk-data";

export function ConnectionStatusPill({ status }: { status: string }) {
  const className =
    status === "Live" || status === "Connected"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Validating" || status === "Pending Cutover"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

export function getApplicationRiskProfile(app: ConnectedApp, events: RiskEvent[]) {
  const appEvents = app.recentRiskEvents ?? events.filter((event) => event.app === app.name);
  const severeCount =
    app.riskMetrics && appEvents.length === 0
      ? app.riskMetrics.severeCount
      : appEvents.filter((event) => event.level === "severe").length;
  const highSevereCount = appEvents.filter((event) => event.level === "high" || event.level === "severe").length;
  const avgScore = appEvents.length
    ? Math.round(appEvents.reduce((sum, event) => sum + event.score, 0) / appEvents.length)
    : app.riskMetrics?.maxRiskScore ?? 0;
  const highestEvent = appEvents.reduce<RiskEvent | undefined>(
    (highest, event) =>
      !highest || riskLevelRank[event.level] > riskLevelRank[highest.level] || event.score > highest.score
        ? event
        : highest,
    undefined,
  );
  const highestLevel = highestEvent?.level ?? levelFromScore(app.riskMetrics?.maxRiskScore ?? 0);
  const topCategory = Object.entries(
    appEvents.reduce<Record<string, number>>((acc, event) => {
      event.rules.forEach((ruleId) => {
        const rule = riskRules.find((item) => item.id === ruleId);
        const category = rule?.category ?? "Other";
        acc[category] = (acc[category] ?? 0) + 1;
      });
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No active risk";

  return {
    events: appEvents,
    severeCount,
    highSevereRate: appEvents.length
      ? Math.round((highSevereCount / appEvents.length) * 100)
      : app.riskMetrics?.riskEventCount
        ? Math.round(((app.riskMetrics.highCount + app.riskMetrics.severeCount) / app.riskMetrics.riskEventCount) * 100)
        : 0,
    avgScore,
    highestLevel,
    topCategory,
  };
}

export function getApplicationCapabilities(app: ConnectedApp) {
  const capabilities = [];
  if (app.policy.includes("RAG") || app.validation.some((item) => item.label === "RAG context captured" && item.done)) {
    capabilities.push("RAG");
  }
  if (app.name.includes("Agent") || app.validation.some((item) => item.label === "Tool calls audited" && item.done)) {
    capabilities.push("Agent Tools");
  }
  if (app.name.includes("Customer") || app.policy.includes("Customer")) capabilities.push("Customer Data");
  if (app.name.includes("HR")) capabilities.push("Employee Data");
  if (app.name.includes("Finance")) capabilities.push("Financial Workflow");
  if (app.environments.some((environment) => environment.name === "Production" && environment.status === "Live")) {
    capabilities.push("Production");
  }
  return capabilities.length ? capabilities : ["Internal Knowledge"];
}

export function MiniDriverBars({ drivers }: { drivers: AnalyticsDriver[] }) {
  const maxValue = Math.max(...drivers.map((driver) => driver.value), 1);

  return (
    <div className="space-y-3">
      {drivers.length ? drivers.map((driver) => (
        <div key={driver.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-ink">{driver.label}</span>
            <span className="shrink-0 font-semibold text-slate-600">{driver.percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full ${driver.tone}`}
              style={{ width: `${Math.max(8, (driver.value / maxValue) * 100)}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-500">{driver.detail}</p>
        </div>
      )) : (
        <p className="rounded-lg bg-panel p-3 text-xs leading-5 text-slate-500">
          No active driver detected in the current event sample.
        </p>
      )}
    </div>
  );
}

export function ApplicationRiskExplanation({
  app,
  profile,
  capabilities,
  onOpenEvent,
}: {
  app: ConnectedApp;
  profile: ReturnType<typeof getApplicationRiskProfile>;
  capabilities: string[];
  onOpenEvent: (id: string) => void;
}) {
  const categoryDrivers = categoryDriversFromEvents(profile.events).slice(0, 3);
  const ruleDrivers = ruleDriversFromEvents(profile.events).slice(0, 3);
  const actionDrivers = driverBarsFromEvents(
    profile.events,
    (event) => titleCaseStatus(event.action),
    (event) => `${levelMeta[event.level].label} · score ${event.score}`,
    "bg-slate-700",
  ).slice(0, 3);
  const highestEvent = profile.events
    .slice()
    .sort((a, b) => b.score - a.score || riskLevelRank[b.level] - riskLevelRank[a.level])[0];
  const topCategory = categoryDrivers[0];
  const topRule = ruleDrivers[0];
  const coverageConcern = app.fieldCoverage < 80 || app.status !== "Connected";
  const primaryCapability = capabilities[0] ?? "AI workflow";

  const summary = topCategory && topRule
    ? `${app.name} is currently risky mainly because ${topCategory.label.toLowerCase()} signals are concentrated in recent events, with ${topRule.label} as the most material matched rule.`
    : coverageConcern
      ? `${app.name} has limited current risk evidence, but integration coverage or connection status may reduce detection confidence.`
      : `${app.name} has no active risk drivers in the current event sample.`;

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Why Is This App Risky?</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Application-level explanation based on recent events, matched rules, and telemetry coverage
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {profile.events.length} events
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-3">
        <p className="text-sm font-semibold leading-6 text-ink">{summary}</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Primary context: {primaryCapability}. Detection confidence is shaped by {app.fieldCoverage}% field coverage and {app.status.toLowerCase()} integration status.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-panel p-3">
          <p className="mb-3 text-xs font-semibold text-slate-500">Risk Category</p>
          <MiniDriverBars drivers={categoryDrivers} />
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="mb-3 text-xs font-semibold text-slate-500">Matched Rules</p>
          <MiniDriverBars drivers={ruleDrivers} />
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="mb-3 text-xs font-semibold text-slate-500">System Actions</p>
          <MiniDriverBars drivers={actionDrivers} />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-panel p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Investigation Focus</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {highestEvent
            ? `Start with "${highestEvent.title}", then compare similar ${topRule?.label ?? "matched rule"} events across Call Logs before changing policy.`
            : coverageConcern
              ? "Start by improving telemetry coverage before drawing conclusions from risk volume."
              : "Continue monitoring this application and compare future events against its bound policy."}
        </p>
        {highestEvent ? (
          <button
            type="button"
            onClick={() => onOpenEvent(highestEvent.id)}
            className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Open Highest-Risk Event
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ConnectedAppDetail({
  app,
  events,
  onOpenEvent,
}: {
  app: ConnectedApp;
  events: RiskEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const completedChecks = app.validation.filter((item) => item.done).length;
  const profile = getApplicationRiskProfile(app, events);
  const capabilities = getApplicationCapabilities(app);

  return (
    <aside className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              App Detail
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ink">{app.name}</h2>
          <p className="mt-1 text-xs text-slate-500">{app.appId}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Risk Level</p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                levelMeta[profile.highestLevel].className
              }`}
            >
              {levelMeta[profile.highestLevel].label}
            </span>
          </div>
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Average Risk Score</p>
            <p className="mt-1 font-semibold text-ink">{profile.avgScore || "No events"}</p>
          </div>
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Severe Events</p>
            <p className="mt-1 font-semibold text-rose-700">{profile.severeCount}</p>
          </div>
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Top Risk Category</p>
            <p className="mt-1 font-medium text-ink">{profile.topCategory}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Owner</p>
            <p className="mt-1 font-medium text-ink">{app.owner}</p>
          </div>
          <div className="rounded-lg bg-panel p-3">
            <p className="text-xs text-slate-500">Integration Status</p>
            <div className="mt-1">
              <ConnectionStatusPill status={app.status} />
            </div>
          </div>
        </div>
      </section>

      <ApplicationRiskExplanation
        app={app}
        profile={profile}
        capabilities={capabilities}
        onOpenEvent={onOpenEvent}
      />

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Recent Risk Events</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {profile.events.length} total
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {profile.events.length ? profile.events.slice(0, 3).map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpenEvent(event.id)}
              className="w-full rounded-lg border border-line bg-panel p-3 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{event.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${levelMeta[event.level].className}`}>
                  {levelMeta[event.level].label}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{event.time} · {event.rules.join(", ")}</p>
            </button>
          )) : (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              No risk events recorded for this application in the current sample.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Bound Policy & Capabilities</h2>
        <div className="mt-4 rounded-lg bg-panel p-3 text-sm">
          <p className="text-xs text-slate-500">Bound Policy</p>
          <p className="mt-1 font-medium text-ink">{app.policy}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {capabilities.map((capability) => (
            <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {capability}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Integration Health</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {completedChecks}/{app.validation.length} checks
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Log field completeness</span>
            <span>{app.fieldCoverage}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-ink" style={{ width: `${app.fieldCoverage}%` }} />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {app.environments.map((environment) => (
            <div
              key={environment.name}
              className="grid grid-cols-[1fr_112px_80px_92px] items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm"
            >
              <span className="font-medium text-ink">{environment.name}</span>
              <ConnectionStatusPill status={environment.status} />
              <span className="text-slate-600">{environment.callsToday}</span>
              <span className="text-xs text-slate-500">{environment.lastSeen}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function ApplicationsView({
  currentProfile,
  onOpenEvent,
}: {
  currentProfile: UserProfile;
  onOpenEvent: (id: string) => void;
}) {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [detailApp, setDetailApp] = useState<ConnectedApp | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedApp = detailApp ?? apps.find((app) => app.id === selectedAppId) ?? apps[0];

  useEffect(() => {
    const controller = new AbortController();

    async function loadApplications() {
      setIsListLoading(true);
      setListError(null);

      try {
        const payload = await apiRequest<{ data: ApplicationListItemApi[] }>("/api/applications", {
          profile: currentProfile,
          signal: controller.signal,
          errorMessage: "Unable to load applications.",
        });
        const nextApps = payload.data.map(mapApplicationItem);
        setApps(nextApps);

        setSelectedAppId((current) =>
          nextApps.length && !nextApps.some((app) => app.id === current) ? nextApps[0].id : current);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError(error instanceof Error ? error.message : "Unable to load applications.");
        setApps([]);
      } finally {
        setIsListLoading(false);
      }
    }

    loadApplications();

    return () => controller.abort();
  }, [currentProfile]);

  useEffect(() => {
    if (!selectedAppId) {
      setDetailApp(null);
      return;
    }

    const controller = new AbortController();

    async function loadApplicationDetail() {
      setIsDetailLoading(true);
      setDetailError(null);

      try {
        const payload = await apiRequest<{ data: ApplicationDetailApi }>(`/api/applications/${selectedAppId}`, {
          profile: currentProfile,
          signal: controller.signal,
          errorMessage: "Unable to load application detail.",
        });
        setDetailApp(mapApplicationItem(payload.data));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error ? error.message : "Unable to load application detail.");
        setDetailApp(null);
      } finally {
        setIsDetailLoading(false);
      }
    }

    loadApplicationDetail();

    return () => controller.abort();
  }, [currentProfile, selectedAppId]);

  const productionApps = apps.filter((app) =>
    app.environments.some((environment) => environment.name === "Production" && environment.status === "Live"),
  ).length;
  const appsWithSevereEvents = apps.filter((app) =>
    (app.riskMetrics?.severeCount ?? 0) > 0,
  ).length;
  const coverageGaps = apps.filter((app) => app.fieldCoverage < 80 || app.status !== "Connected").length;

  return (
    <div className="space-y-5 p-6">
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Monitored Applications"
          value={`${apps.length}`}
          delta="AI applications registered in the current risk inventory"
          icon={Code2}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Production Apps"
          value={`${productionApps}`}
          delta="Applications sending production traffic into AI RiskOps"
          icon={Activity}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          title="Apps with Severe Events"
          value={`${appsWithSevereEvents}`}
          delta="Applications with at least one severe risk event"
          icon={ClipboardList}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          title="Coverage Gaps"
          value={`${coverageGaps}`}
          delta="Apps with incomplete telemetry or non-connected status"
          icon={AlertOctagon}
          tone="bg-slate-100 text-slate-700"
        />
      </section>

      <section className="grid grid-cols-[1.25fr_0.95fr] gap-5">
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Application Risk Inventory</h2>
              <p className="text-xs text-slate-500">
                Compare monitored AI applications by risk level, severe events, policy binding, and integration health
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_92px_82px_82px_1fr_112px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
            <span>Application</span>
            <span>Risk Level</span>
            <span>Events</span>
            <span>Severe</span>
            <span>Bound Policy</span>
            <span>Integration</span>
          </div>
          <div>
            {listError ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-rose-700">{listError}</p>
              </div>
            ) : isListLoading && !apps.length ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-600">Loading applications...</p>
              </div>
            ) : apps.length ? apps.map((app) => {
              const profile = getApplicationRiskProfile(app, []);
              return (
                <button
                  key={app.name}
                  type="button"
                  onClick={() => setSelectedAppId(app.id)}
                  className={`grid w-full grid-cols-[1fr_92px_82px_82px_1fr_112px] items-center gap-3 border-b border-line px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                    app.id === selectedAppId ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{app.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {app.owner} · {app.callsToday} calls today
                    </span>
                  </span>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                      levelMeta[profile.highestLevel].className
                    }`}
                  >
                    {levelMeta[profile.highestLevel].label}
                  </span>
                  <span className="text-slate-600">{app.riskMetrics?.riskEventCount ?? profile.events.length}</span>
                  <span className="font-medium text-rose-700">{profile.severeCount}</span>
                  <span className="truncate text-slate-600">{app.policy}</span>
                  <ConnectionStatusPill status={app.status} />
                </button>
              );
            }) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink">No applications in the current access scope.</p>
                <p className="mt-1 text-xs text-slate-500">Change the user profile to view additional applications.</p>
              </div>
            )}
          </div>
        </section>

        {selectedApp ? (
          <div>
            {detailError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {detailError}
              </div>
            ) : null}
            {isDetailLoading && !detailApp ? (
              <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">Loading Application Detail</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Fetching policy binding, integration health, and recent risk events from the backend API.
                </p>
              </aside>
            ) : (
              <ConnectedAppDetail
                app={selectedApp}
                events={selectedApp.recentRiskEvents ?? []}
                onOpenEvent={onOpenEvent}
              />
            )}
          </div>
        ) : (
          <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-ink">No Application Selected</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              There are no applications available for the current access scope.
            </p>
          </aside>
        )}
      </section>
    </div>
  );
}
