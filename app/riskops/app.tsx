"use client";

import { Bell, Settings2, Shield, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/login/actions";
import { type RiskEventDrillThroughFilters } from "@/app/riskops/analytics-shared";
import {
  type ModelCallIngestionApi,
  type OverviewApiData,
  type OverviewCategoryApi,
  type OverviewSevereEventApi,
  type OverviewSummaryApi,
  type OverviewTopApplicationApi,
} from "@/app/riskops/api-types";
import { ApplicationSetup } from "@/app/riskops/application-setup";
import { ApplicationsView } from "@/app/riskops/applications";
import { CallLogsView } from "@/app/riskops/call-logs";
import {
  type NavLabel,
  type UserProfile,
  adminNavItems,
  assignedApplicationNames,
  modelCallIngestionContractVersion,
  navItems,
  pageSubtitlesByProfile,
  userProfileIntents,
  userProfiles,
} from "@/app/riskops/config";
import { profileQueryValue } from "@/app/riskops/mappers";
import {
  readCurrentSearchParams,
  readInitialNav,
  replaceUrlParams,
  updateUrlPage,
} from "@/app/riskops/navigation";
import { Overview } from "@/app/riskops/overview";
import { PolicyCenter } from "@/app/riskops/policy-center";
import { RiskAnalytics } from "@/app/riskops/risk-analytics";
import { RiskEventsWorkbench } from "@/app/riskops/risk-events";
import { UserAccessAdmin } from "@/app/riskops/user-access";
import { type SandboxInput } from "@/lib/risk-engine";

export type AppSession = {
  demoMode: boolean;
  profile: "Global User" | "App Owner" | "Platform Admin";
  user: { name: string; email: string } | null;
  // Null in demo mode, where the simulated profile decides what is visible.
  permissions: Record<string, boolean | string> | null;
  assignedApplicationCount: number | null;
  // Query string of the request that rendered the page.
  initialSearch: string;
};

const navCapabilities: Record<NavLabel, string> = {
  Overview: "canViewOverview",
  "Risk Analytics": "canViewRiskAnalytics",
  "Risk Events": "canViewRiskEvents",
  "Call Logs": "canViewCallLogs",
  Applications: "canViewApplications",
  "Policy Center": "canViewPolicyCenter",
  "Application Setup": "canViewApplicationSetup",
  "User Access": "canManageUserAccess",
};

function isNavVisible(label: NavLabel, permissions: AppSession["permissions"], profileLabel: UserProfile) {
  if (permissions) {
    return permissions[navCapabilities[label]] === true;
  }

  const profile = userProfiles.find((item) => item.label === profileLabel) ?? userProfiles[0];

  return adminNavItems.some((item) => item.label === label) ? profile.admin : !profile.hiddenNav?.includes(label);
}

export default function RiskOpsApp({ session }: { session: AppSession }) {
  const [selectedId, setSelectedId] = useState("");
  const [selectedLogId, setSelectedLogId] = useState("");
  const [activeNav, setActiveNav] = useState<NavLabel>(() => {
    const requested = readInitialNav(session.initialSearch);

    return isNavVisible(requested, session.permissions, session.profile)
      ? requested
      : navItems.find((item) => isNavVisible(item.label, session.permissions, session.profile))?.label ?? "Overview";
  });
  const [currentProfile, setCurrentProfile] = useState<UserProfile>(session.profile);
  const [overviewData, setOverviewData] = useState<OverviewApiData | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const [riskEventDrillThrough, setRiskEventDrillThrough] = useState<RiskEventDrillThroughFilters | null>(null);
  const accessProfile = userProfiles.find((profile) => profile.label === currentProfile) ?? userProfiles[0];
  const isAssignedApplicationScope = accessProfile.scope === "Assigned Applications";
  const assignedApplicationCount = session.assignedApplicationCount ?? assignedApplicationNames.length;
  const { permissions } = session;
  const visibleNavItems = navItems.filter((item) => isNavVisible(item.label, permissions, currentProfile));
  const visibleAdminNavItems = adminNavItems.filter((item) => isNavVisible(item.label, permissions, currentProfile));
  const fallbackNav = visibleNavItems[0]?.label ?? "Overview";
  const canOpenActiveNav = [...visibleNavItems, ...visibleAdminNavItems].some((item) => item.label === activeNav);

  useEffect(() => {
    if (!canOpenActiveNav) {
      setActiveNav(fallbackNav);
      updateUrlPage(fallbackNav);
    }
  }, [canOpenActiveNav, fallbackNav]);

  useEffect(() => {
    const controller = new AbortController();
    const profile = encodeURIComponent(profileQueryValue(currentProfile));

    async function loadOverview() {
      setIsOverviewLoading(true);
      setOverviewError(null);

      try {
        const [summaryResponse, categoriesResponse, topApplicationsResponse, severeEventsResponse] =
          await Promise.all([
            fetch(`/api/overview/summary?profile=${profile}`, { signal: controller.signal }),
            fetch(`/api/overview/risk-categories?profile=${profile}`, { signal: controller.signal }),
            fetch(`/api/overview/top-applications?profile=${profile}`, { signal: controller.signal }),
            fetch(`/api/overview/severe-events?profile=${profile}`, { signal: controller.signal }),
          ]);

        if (
          !summaryResponse.ok ||
          !categoriesResponse.ok ||
          !topApplicationsResponse.ok ||
          !severeEventsResponse.ok
        ) {
          throw new Error("Unable to load overview data");
        }

        const [summaryPayload, categoriesPayload, topApplicationsPayload, severeEventsPayload] =
          await Promise.all([
            summaryResponse.json() as Promise<{ data: OverviewSummaryApi }>,
            categoriesResponse.json() as Promise<{ data: OverviewCategoryApi[] }>,
            topApplicationsResponse.json() as Promise<{ data: OverviewTopApplicationApi[] }>,
            severeEventsResponse.json() as Promise<{ data: OverviewSevereEventApi[] }>,
          ]);

        setOverviewData({
          summary: summaryPayload.data,
          categories: categoriesPayload.data,
          topApplications: topApplicationsPayload.data,
          severeEvents: severeEventsPayload.data,
        });
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setOverviewError("Unable to load overview data from the backend APIs.");
          setOverviewData(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsOverviewLoading(false);
        }
      }
    }

    loadOverview();

    return () => controller.abort();
  }, [currentProfile, overviewRefreshKey]);

  const simulateIngestion = async (input: SandboxInput) => {
    const profile = encodeURIComponent(profileQueryValue(currentProfile));
    const response = await fetch(`/api/ingest/model-call?profile=${profile}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-riskops-source": "sdk",
        "x-ai-riskops-contract-version": modelCallIngestionContractVersion,
      },
      body: JSON.stringify({
        contractVersion: modelCallIngestionContractVersion,
        ingestionSource: "sdk",
        application: {
          name: input.app,
        },
        request: {
          traceId: `sim-${Date.now()}`,
          occurredAt: new Date().toISOString(),
        },
        user: {
          role: input.userRole,
        },
        model: {
          provider: "openai",
          name: "gpt-4.1",
        },
        environment: input.environment,
        content: {
          prompt: input.prompt,
          output: input.output,
        },
        context: {
          dataType: input.dataType,
          ragContext: input.ragContext,
        },
        agent: {
          toolCall: input.toolCall,
        },
        templateId: input.templateId,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to ingest model call.");
    }

    const payload = (await response.json()) as { data: ModelCallIngestionApi };
    setSelectedLogId(payload.data.callLog.id);

    if (payload.data.riskEvent?.id) {
      setSelectedId(payload.data.riskEvent.id);
    }

    setOverviewRefreshKey((current) => current + 1);
    setActiveNav("Call Logs");
    updateUrlPage("Call Logs");
  };

  const openRiskEvent = (id: string) => {
    setSelectedId(id);
    setRiskEventDrillThrough(null);
    setActiveNav("Risk Events");
    updateUrlPage("Risk Events");
  };

  const openRiskEventsFromAnalytics = (filters: Omit<RiskEventDrillThroughFilters, "id">) => {
    setRiskEventDrillThrough({ ...filters, id: Date.now() });
    setActiveNav("Risk Events");
    const params = readCurrentSearchParams();
    params.set("page", "risk-events");

    if (filters.level) params.set("level", filters.level);
    else params.delete("level");

    if (filters.action) params.set("action", filters.action);
    else params.delete("action");

    if (filters.applicationId) params.set("application_id", filters.applicationId);
    else params.delete("application_id");

    if (filters.environment) params.set("environment", filters.environment.toLowerCase());
    else params.delete("environment");

    if (filters.q) params.set("q", filters.q);
    else params.delete("q");

    params.delete("review_status");
    params.set("source", filters.source);
    params.set("label", filters.label);
    replaceUrlParams(params);
  };

  const pageTitle =
    activeNav === "Risk Events"
        ? "Risk Events"
      : activeNav === "Risk Analytics"
        ? "Risk Analytics"
      : activeNav === "Call Logs"
        ? "AI Call Logs"
        : activeNav === "Policy Center"
          ? "Policy Center"
          : activeNav === "Application Setup"
            ? "Application Setup"
            : activeNav === "User Access"
              ? "User Access"
          : activeNav === "Applications"
            ? "Applications"
        : "AI Application Risk Overview";
  const pageSubtitle =
    pageSubtitlesByProfile[currentProfile][activeNav] ??
    "Monitor AI application risk posture, events, calls, and application-level risk profiles";

  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-line bg-white">
          <div className="flex h-16 items-center gap-3 border-b border-line px-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">AI RiskOps</p>
              <p className="text-xs text-slate-500">AI Security Operations Platform</p>
            </div>
          </div>
          <div className="flex h-[calc(100vh-4rem)] flex-col justify-between p-3">
            <nav className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.label === activeNav;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.label);
                      updateUrlPage(item.label);
                    }}
                    className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                      isActive
                        ? "bg-ink text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {visibleAdminNavItems.length ? (
              <nav className="border-t border-line pt-3">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Admin
                </p>
                <div className="space-y-1">
                  {visibleAdminNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.label === activeNav;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setActiveNav(item.label);
                          updateUrlPage(item.label);
                        }}
                        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                          isActive
                            ? "bg-ink text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-left">{item.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {item.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            ) : (
              <div className="border-t border-line px-3 pt-3 text-xs leading-5 text-slate-500">
                <p className="font-semibold uppercase tracking-wide text-slate-400">Admin</p>
                <p className="mt-1">No admin surfaces available for this profile.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1">
          <header className="flex h-16 items-center justify-between border-b border-line bg-white px-6">
            <div>
              <h1 className="text-lg font-semibold text-ink">{pageTitle}</h1>
              <p className="text-xs text-slate-500">{pageSubtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
                {session.demoMode ? (
                  <>
                    <span className="text-xs font-medium text-slate-500">User Profile</span>
                    <select
                      value={currentProfile}
                      onChange={(event) => setCurrentProfile(event.target.value as UserProfile)}
                      className="h-7 bg-transparent text-sm font-medium text-ink outline-none"
                    >
                      {userProfiles.map((profile) => (
                        <option key={profile.label} value={profile.label}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-sm font-medium text-ink" title={session.user?.email}>
                    {session.user?.name} · {currentProfile}
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  Scope: {isAssignedApplicationScope ? `Assigned Apps: ${assignedApplicationCount}` : accessProfile.scope}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {userProfileIntents[currentProfile]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    accessProfile.admin ? "bg-ink text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {accessProfile.admin ? "Admin access" : "No admin access"}
                </span>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-slate-600 hover:bg-slate-50">
                <Bell className="h-4 w-4" />
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-slate-600 hover:bg-slate-50">
                <Settings2 className="h-4 w-4" />
              </button>
              {session.demoMode ? null : (
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="h-9 rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </header>

          <section className={session.demoMode ? "border-b border-amber-200 bg-amber-50 px-6 py-2" : "hidden"}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <Shield className="h-4 w-4 shrink-0 text-amber-700" />
                <p className="truncate text-xs font-medium text-amber-900">
                  Public demo mode: read-only. User Profile switching simulates access scope and is not production authentication.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                Demo / Profile Mode
              </span>
            </div>
          </section>

          {activeNav === "Risk Events" ? (
            <RiskEventsWorkbench
              initialSearch={session.initialSearch}
              currentProfile={currentProfile}
              selectedId={selectedId}
              onSelect={setSelectedId}
              drillThroughFilters={riskEventDrillThrough}
            />
          ) : activeNav === "Risk Analytics" ? (
            <RiskAnalytics
              currentProfile={currentProfile}
              onOpenRiskEvents={openRiskEventsFromAnalytics}
            />
          ) : activeNav === "Call Logs" ? (
            <CallLogsView
              currentProfile={currentProfile}
              selectedLogId={selectedLogId}
              onSelect={setSelectedLogId}
            />
          ) : activeNav === "Policy Center" ? (
            <PolicyCenter currentProfile={currentProfile} onSimulateIngestion={simulateIngestion} />
          ) : activeNav === "Application Setup" ? (
            <ApplicationSetup currentProfile={currentProfile} />
          ) : activeNav === "User Access" ? (
            <UserAccessAdmin currentProfile={currentProfile} />
          ) : activeNav === "Applications" ? (
            <ApplicationsView
              currentProfile={currentProfile}
              onOpenEvent={openRiskEvent}
            />
          ) : (
            <Overview
              currentProfile={currentProfile}
              overviewData={overviewData}
              isLoading={isOverviewLoading}
              error={overviewError}
              onOpenEvent={openRiskEvent}
            />
          )}
        </section>
      </div>
    </main>
  );
}
