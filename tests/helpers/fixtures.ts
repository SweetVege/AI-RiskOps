import { generateApplicationCredentialSecret } from "@/lib/api/application-credentials";
import { prisma } from "@/lib/prisma";
import { riskRules } from "@/lib/risk-data";

export const fixtureIds = {
  template: "tpl-test",
  appA: "app-test-a",
  appB: "app-test-b",
  ownerUser: "user-demo-owner",
};

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

  await prisma.user.create({
    data: {
      id: fixtureIds.ownerUser,
      email: "owner@example.test",
      name: "Test Owner",
      applicationAccess: {
        create: { id: "access-owner-a", applicationId: fixtureIds.appA, permission: "viewer" },
      },
    },
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
