import { capabilityKeys } from "@/lib/api/permissions";
import { generateApplicationCredentialSecret } from "@/lib/api/application-credentials";
import { prisma } from "@/lib/prisma";
import { riskRules } from "@/lib/risk-data";

export const fixtureIds = {
  template: "tpl-test",
  appA: "app-test-a",
  appB: "app-test-b",
  ownerUser: "user-demo-owner",
};

export const fixtureUsers = {
  admin: "admin@example.test",
  global: "global@example.test",
  owner: "owner@example.test",
};

const viewCapabilities = capabilityKeys.filter((capability) =>
  ["canViewOverview", "canViewRiskAnalytics", "canViewRiskEvents", "canViewCallLogs", "canViewApplications"].includes(capability),
);

const permissionSets = [
  { id: "perm-platform-admin", name: "Platform Admin", dataScope: "global", capabilities: [...capabilityKeys] },
  { id: "perm-global-user", name: "Global User", dataScope: "global", capabilities: [...viewCapabilities, "canUpdateRiskEventReview"] },
  { id: "perm-app-owner", name: "App Owner", dataScope: "assigned_applications", capabilities: viewCapabilities },
];

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "IngestionRequestAudit", "RiskEventEvidence", "RiskEventRuleMatch", "RiskEvent", "AiCallLog",
      "ApplicationCredential", "IntegrationValidationCheck", "ApplicationEnvironment",
      "UserApplicationAccess", "UserPermissionSetAssignment", "PermissionSetCapability", "PermissionSet",
      "UserProfileAssignment", "AccessAuditLog", "User", "Application",
      "PolicyRule", "RuleOperationalStat", "RiskRule", "PolicyTemplate"
    CASCADE
  `);
}

export async function seedFixtures() {
  await resetDatabase();

  await prisma.riskRule.createMany({ data: riskRules });
  await prisma.policyTemplate.create({
    data: {
      id: fixtureIds.template,
      name: "Test Template",
      scope: "All applications",
      defaultAction: "review",
      thresholds: "{}",
      enabled: true,
      policyRules: {
        create: riskRules.map((rule) => ({
          id: `${fixtureIds.template}-${rule.id}`,
          riskRuleId: rule.id,
        })),
      },
    },
  });

  for (const [id, name] of [[fixtureIds.appA, "Test App A"], [fixtureIds.appB, "Test App B"]]) {
    await prisma.application.create({
      data: {
        id,
        name,
        slug: id,
        ownerTeam: "Test Team",
        status: "validating",
        policyTemplateId: fixtureIds.template,
        integrationMethod: "sdk",
        fieldCoverage: 0,
      },
    });
  }

  for (const set of permissionSets) {
    await prisma.permissionSet.create({
      data: {
        id: set.id,
        name: set.name,
        description: set.name,
        dataScope: set.dataScope,
        capabilities: {
          create: set.capabilities.map((capability) => ({ id: `${set.id}-${capability}`, capability })),
        },
      },
    });
  }

  // The owner keeps the demo user ID so demo-mode profile switching resolves to the same assignments.
  for (const [id, email, permissionSetId] of [
    ["user-test-admin", fixtureUsers.admin, "perm-platform-admin"],
    ["user-test-global", fixtureUsers.global, "perm-global-user"],
    [fixtureIds.ownerUser, fixtureUsers.owner, "perm-app-owner"],
  ]) {
    await prisma.user.create({
      data: {
        id,
        email,
        name: email,
        permissionSets: { create: { id: `${id}-${permissionSetId}`, permissionSetId } },
      },
    });
  }

  await prisma.userApplicationAccess.create({
    data: { id: "access-owner-a", userId: fixtureIds.ownerUser, applicationId: fixtureIds.appA, permission: "viewer" },
  });
}

export async function createCredential(applicationId: string, status = "active") {
  const generated = generateApplicationCredentialSecret("sdk");
  const credential = await prisma.applicationCredential.create({
    data: {
      id: `cred-${applicationId}-${status}`,
      applicationId,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      status,
      integrationSource: "sdk",
      createdBy: "test",
    },
  });

  return { credential, secret: generated.secret };
}

export function jsonRequest(url: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
