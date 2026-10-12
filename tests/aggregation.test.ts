import { beforeAll, describe, expect, it } from "vitest";
import { GET as getDrivers } from "@/app/api/analytics/drivers/route";
import { GET as getAnalyticsSummary } from "@/app/api/analytics/summary/route";
import { GET as listApplications } from "@/app/api/applications/route";
import { GET as getCategories } from "@/app/api/overview/risk-categories/route";
import { GET as getTrend } from "@/app/api/overview/risk-level-trend/route";
import { GET as getOverviewSummary } from "@/app/api/overview/summary/route";
import { GET as getTopApplications } from "@/app/api/overview/top-applications/route";
import { prisma } from "@/lib/prisma";
import { fixtureIds, fixtureUsers, jsonRequest, seedFixtures } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";

type Call = {
  id: string;
  applicationId: string;
  action: string;
  environment?: string;
  event?: { level: string; score: number; occurredAt: string; rules: string[] };
};

const calls: Call[] = [
  { id: "a1", applicationId: fixtureIds.appA, action: "block", event: { level: "severe", score: 90, occurredAt: "2026-01-15T10:00:00.000Z", rules: ["DLP-002"] } },
  { id: "a2", applicationId: fixtureIds.appA, action: "review", event: { level: "high", score: 70, occurredAt: "2026-02-10T23:30:00.000Z", rules: ["PI-001", "DLP-001"] } },
  { id: "a3", applicationId: fixtureIds.appA, action: "allow" },
  { id: "a4", applicationId: fixtureIds.appA, action: "allow", environment: "test" },
  { id: "b1", applicationId: fixtureIds.appB, action: "flag", event: { level: "medium", score: 40, occurredAt: "2026-02-20T08:00:00.000Z", rules: ["DLP-001"] } },
  { id: "b2", applicationId: fixtureIds.appB, action: "allow" },
];

async function data(handler: (request: Request) => Promise<Response>, query = "") {
  const response = await handler(jsonRequest(`/api/test${query}`));

  expect(response.status).toBe(200);

  return (await response.json()).data;
}

beforeAll(async () => {
  await seedFixtures();

  for (const call of calls) {
    const occurredAt = new Date(call.event?.occurredAt ?? "2026-03-01T00:00:00.000Z");
    const shared = {
      applicationId: call.applicationId,
      occurredAt,
      userRef: `user-${call.id}`,
      model: "test-model",
      environment: call.environment ?? "production",
      score: call.event?.score ?? 0,
      level: call.event?.level ?? "low",
      action: call.action,
    };

    await prisma.aiCallLog.create({
      data: { ...shared, id: `call-${call.id}`, traceId: `trace-${call.id}`, prompt: "", output: "", ragContext: "" },
    });

    if (call.event) {
      await prisma.riskEvent.create({
        data: {
          ...shared,
          id: `evt-${call.id}`,
          sourceCallLogId: `call-${call.id}`,
          title: `Event ${call.id}`,
          department: "Support",
          reviewStatus: "pending_review",
          owner: "Unassigned",
          sla: "8 hours",
          riskExplanation: "",
          recommendation: "",
          updatedAt: occurredAt,
          ruleMatches: {
            create: call.event.rules.map((riskRuleId) => ({ id: `evt-${call.id}-${riskRuleId}`, riskRuleId })),
          },
        },
      });
    }
  }
});

describe("overview aggregation", () => {
  it("summarizes calls and events", async () => {
    signInAs(fixtureUsers.global);

    expect(await data(getOverviewSummary)).toEqual({
      modelCallsToday: 6,
      riskEvents: 3,
      blocked: 1,
      averageEventRiskScore: 66.7,
      severeEvents: 1,
      highRiskEvents: 1,
      blockedModelCalls: 1,
    });
  });

  it("limits the summary to an app owner's applications", async () => {
    signInAs(fixtureUsers.owner);

    expect(await data(getOverviewSummary)).toMatchObject({ modelCallsToday: 4, riskEvents: 2, averageEventRiskScore: 80 });
  });

  it("buckets the severity trend by UTC period", async () => {
    signInAs(fixtureUsers.global);

    expect(await data(getTrend, "?period=monthly")).toEqual([
      { key: "2026-01", label: "Jan 2026", total: 1, severity: { low: 0, medium: 0, high: 0, severe: 1 }, highSevereRate: 100 },
      { key: "2026-02", label: "Feb 2026", total: 2, severity: { low: 0, medium: 1, high: 1, severe: 0 }, highSevereRate: 50 },
    ]);
    expect((await data(getTrend, "?period=daily")).map((bucket: { key: string }) => bucket.key)).toEqual([
      "2026-01-15",
      "2026-02-10",
      "2026-02-20",
    ]);
    expect(await data(getTrend, "?period=quarterly")).toMatchObject([{ key: "2026-Q1", total: 3 }]);
  });

  it("returns an empty trend for an owner with no applications", async () => {
    await prisma.user.create({
      data: {
        id: "user-no-apps",
        email: "noapps@example.test",
        name: "No Apps",
        permissionSets: { create: { id: "user-no-apps-perm", permissionSetId: "perm-app-owner" } },
      },
    });
    signInAs("noapps@example.test");

    expect(await data(getTrend)).toEqual([]);
  });

  it("counts rule matches by category", async () => {
    signInAs(fixtureUsers.global);

    expect(await data(getCategories)).toEqual([
      { category: "Data Leakage", count: 3, percentage: 75 },
      { category: "Input Attack", count: 1, percentage: 25 },
    ]);
  });

  it("ranks applications by severe then high events", async () => {
    signInAs(fixtureUsers.global);

    expect(await data(getTopApplications)).toMatchObject([
      { id: fixtureIds.appA, severeCount: 1, highCount: 1, riskEventCount: 2, callLogCount: 4, blockedCount: 1, averageEventRiskScore: 80, maxRiskScore: 90 },
      { id: fixtureIds.appB, severeCount: 0, highCount: 0, riskEventCount: 1, callLogCount: 2, blockedCount: 0, averageEventRiskScore: 40, maxRiskScore: 40 },
    ]);
  });

  it("reports per-application metrics in the application list", async () => {
    signInAs(fixtureUsers.global);

    const applications = await data(listApplications);

    expect(applications.find((application: { id: string }) => application.id === fixtureIds.appA).metrics).toEqual({
      callLogCount: 4,
      riskEventCount: 2,
      severeCount: 1,
      highCount: 1,
      maxRiskScore: 90,
      latestEventAt: "2026-02-10T23:30:00.000Z",
    });
  });
});

describe("analytics aggregation", () => {
  it("computes summary rates from grouped call logs", async () => {
    signInAs(fixtureUsers.global);

    expect(await data(getAnalyticsSummary)).toEqual({
      riskEvents: 3,
      modelCalls: 6,
      highSevereEvents: 2,
      highSevereRate: 66.7,
      riskEventRate: 50,
      blockRate: 16.7,
      averageRiskScore: 66.7,
      blockedModelCalls: 1,
    });
    expect(await data(getAnalyticsSummary, "?environment=test")).toMatchObject({ riskEvents: 0, modelCalls: 1 });
    expect(await data(getAnalyticsSummary, `?application_id=${fixtureIds.appB}`)).toMatchObject({ riskEvents: 1, modelCalls: 2 });
  });

  it("combines event severity with call volume in drivers", async () => {
    signInAs(fixtureUsers.global);

    const drivers = await data(getDrivers);

    expect(drivers.applications).toMatchObject([
      { id: fixtureIds.appA, contribution: 77.8, weightedScore: 7, riskEvents: 2, highSevereRate: 100, averageRiskScore: 80, blockRate: 25 },
      { id: fixtureIds.appB, contribution: 22.2, weightedScore: 2, riskEvents: 1, highSevereRate: 0, averageRiskScore: 40, blockRate: 0 },
    ]);
    expect(drivers.environments).toMatchObject([
      { id: "production", label: "Production", riskEvents: 3, blockRate: 20 },
      { id: "test", label: "Test", riskEvents: 0, weightedScore: 0 },
    ]);
    expect(drivers.rules.map((rule: { id: string }) => rule.id).sort()).toEqual(["DLP-001", "DLP-002", "PI-001"]);
  });
});
