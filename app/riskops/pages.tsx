"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/app/riskops/api";
import {
  type OverviewApiData,
  type OverviewCategoryApi,
  type OverviewSevereEventApi,
  type OverviewSummaryApi,
  type OverviewTopApplicationApi,
} from "@/app/riskops/api-types";
import { ApplicationSetup } from "@/app/riskops/application-setup";
import { ApplicationsView } from "@/app/riskops/applications";
import { CallLogsView } from "@/app/riskops/call-logs";
import { Overview } from "@/app/riskops/overview";
import { PolicyCenter } from "@/app/riskops/policy-center";
import { RiskAnalytics } from "@/app/riskops/risk-analytics";
import { RiskEventsWorkbench } from "@/app/riskops/risk-events";
import { useConsole } from "@/app/riskops/shell";
import { UserAccessAdmin } from "@/app/riskops/user-access";

export function OverviewPage() {
  const { currentProfile, openRiskEvent } = useConsole();
  const [overviewData, setOverviewData] = useState<OverviewApiData | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setIsOverviewLoading(true);
      setOverviewError(null);

      try {
        const request = <T,>(path: string) => apiRequest<{ data: T }>(path, {
          profile: currentProfile,
          signal: controller.signal,
          errorMessage: "Unable to load overview data",
        });
        const [summaryPayload, categoriesPayload, topApplicationsPayload, severeEventsPayload] = await Promise.all([
          request<OverviewSummaryApi>("/api/overview/summary"),
          request<OverviewCategoryApi[]>("/api/overview/risk-categories"),
          request<OverviewTopApplicationApi[]>("/api/overview/top-applications"),
          request<OverviewSevereEventApi[]>("/api/overview/severe-events"),
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
  }, [currentProfile]);

  return (
    <Overview
      currentProfile={currentProfile}
      overviewData={overviewData}
      isLoading={isOverviewLoading}
      error={overviewError}
      onOpenEvent={openRiskEvent}
    />
  );
}

export function RiskAnalyticsPage() {
  const { currentProfile, openRiskEvents } = useConsole();

  return <RiskAnalytics currentProfile={currentProfile} onOpenRiskEvents={openRiskEvents} />;
}

export function RiskEventsPage() {
  const { currentProfile, selectedEventId, selectEvent } = useConsole();
  const initialSearch = useSearchParams().toString();

  return (
    <RiskEventsWorkbench
      initialSearch={initialSearch}
      currentProfile={currentProfile}
      selectedId={selectedEventId}
      onSelect={selectEvent}
    />
  );
}

export function CallLogsPage() {
  const { currentProfile, selectedLogId, selectLog } = useConsole();

  return <CallLogsView currentProfile={currentProfile} selectedLogId={selectedLogId} onSelect={selectLog} />;
}

export function ApplicationsPage() {
  const { currentProfile, openRiskEvent } = useConsole();

  return <ApplicationsView currentProfile={currentProfile} onOpenEvent={openRiskEvent} />;
}

export function PolicyCenterPage() {
  const { currentProfile, simulateIngestion } = useConsole();

  return <PolicyCenter currentProfile={currentProfile} onSimulateIngestion={simulateIngestion} />;
}

export function ApplicationSetupPage() {
  const { currentProfile } = useConsole();

  return <ApplicationSetup currentProfile={currentProfile} />;
}

export function UserAccessPage() {
  const { currentProfile } = useConsole();

  return <UserAccessAdmin currentProfile={currentProfile} />;
}
