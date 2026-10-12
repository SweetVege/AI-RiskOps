import { authorizeRequest } from "@/lib/api/authorize";
import { NextResponse } from "next/server";
import {
  analyticsDrivers,
  analyticsFilterResponse,
  analyticsFiltersFromSearchParams,
  analyticsSummary,
  loadAnalyticsDataset,
} from "@/lib/api/analytics";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewRiskAnalytics");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canExportAnalytics"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canExportAnalytics"));
  }

  const filters = analyticsFiltersFromSearchParams(searchParams);
  const format = searchParams.get("format") ?? "json";
  const { riskEvents, callLogs } = await loadAnalyticsDataset(scope, filters);
  const summary = analyticsSummary(riskEvents, callLogs);
  const drivers = analyticsDrivers(riskEvents, callLogs);
  const report = {
    generatedAt: new Date().toISOString(),
    scope: scopeResponse(scope),
    filters: analyticsFilterResponse(filters),
    summary,
    topDrivers: {
      application: drivers.applications[0] ?? null,
      category: drivers.categories[0] ?? null,
      rule: drivers.rules[0] ?? null,
      environment: drivers.environments[0] ?? null,
      model: drivers.models[0] ?? null,
      user: drivers.users[0] ?? null,
    },
  };

  if (format === "csv") {
    return new NextResponse(reportCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-riskops-analytics-report-${report.generatedAt.slice(0, 10)}.csv"`,
      },
    });
  }

  return apiOk({
    data: report,
  });
}

function reportCsv(report: {
  generatedAt: string;
  scope: ReturnType<typeof scopeResponse>;
  filters: ReturnType<typeof analyticsFilterResponse>;
  summary: ReturnType<typeof analyticsSummary>;
  topDrivers: Record<string, {
    label: string;
    contribution: number;
    riskEvents: number;
    highSevereRate: number;
    averageRiskScore: number;
    mainDriver: string | null;
  } | null>;
}) {
  const rows = [
    ["section", "metric", "value", "detail"],
    ["metadata", "generated_at", report.generatedAt, ""],
    ["metadata", "profile", report.scope.profile, report.scope.mode],
    ["filters", "application_id", report.filters.applicationId ?? "all", ""],
    ["filters", "level", report.filters.level ?? "all", ""],
    ["filters", "environment", report.filters.environment ?? "all", ""],
    ["filters", "action", report.filters.action ?? "all", ""],
    ["summary", "risk_events", String(report.summary.riskEvents), ""],
    ["summary", "model_calls", String(report.summary.modelCalls), ""],
    ["summary", "high_severe_rate", String(report.summary.highSevereRate), "%"],
    ["summary", "risk_event_rate", String(report.summary.riskEventRate), "%"],
    ["summary", "block_rate", String(report.summary.blockRate), "%"],
    ["summary", "average_risk_score", String(report.summary.averageRiskScore), ""],
    ...Object.entries(report.topDrivers).map(([key, driver]) => [
      "top_driver",
      key,
      driver?.label ?? "none",
      driver ? `${driver.contribution}% contribution; ${driver.riskEvents} events; ${driver.highSevereRate}% High+Severe; main driver ${driver.mainDriver ?? "n/a"}` : "",
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
