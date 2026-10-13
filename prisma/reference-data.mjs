// Reference data every deployment needs: the rule catalog, policy templates, and permission sets.
// The demo seed loads it together with sample data; `pnpm run db:init` loads it alone.
import fs from "node:fs";

export const riskRules = JSON.parse(fs.readFileSync(new URL("../lib/risk-rules.json", import.meta.url), "utf8"))
  .map((rule) => [rule.id, rule.name, rule.category, rule.trigger, rule.baseScore, rule.defaultAction, rule.iconName]);

export const policyTemplates = [
  ["policy-customer-support", "Customer Support Copilot Policy", "Support bots, ticket summarization, customer follow-up assistants", "Redaction first", "60+ review, 80+ block", true, ["PI-001", "SYS-001", "DLP-001", "PI-002", "ABUSE-001"], { reviewAtScore: 60, blockAtScore: 80 }],
  ["policy-rag-kb", "RAG Knowledge Base Policy", "Internal knowledge bases, contract review, web-retrieval assistants", "Injection blocking", "50+ flag, 65+ block", true, ["PI-002", "DLP-001", "DLP-002"], { blockAtScore: 65 }],
  ["policy-finance-agent", "Finance Agent Policy", "Payment approval, expense review, vendor reconciliation agents", "High-risk review", "45+ review, 80+ escalate", true, ["TOOL-001", "ACCESS-001", "DLP-002"], { reviewAtScore: 45, escalateAtScore: 80 }],
  ["policy-hr-assistant", "HR Assistant Policy", "Employee policy Q&A, compensation and benefits, org-data assistants", "Unauthorized access blocking", "60+ block, 80+ escalate", true, ["ACCESS-001", "DLP-001"], { blockAtScore: 60, escalateAtScore: 80 }],
  ["policy-general-low-risk", "General Low-Risk Policy", "Public-knowledge Q&A, low-sensitivity office assistants, test apps", "Flag for observation", "60+ flag, 85+ review", false, ["ABUSE-001", "DLP-001"], { reviewAtScore: 85 }],
];

export const permissionSets = [
  {
    id: "perm-global-user",
    name: "Global User",
    description: "Global read access with lightweight risk-event review metadata updates.",
    dataScope: "global",
    capabilities: [
      "canViewOverview",
      "canViewRiskAnalytics",
      "canViewRiskEvents",
      "canViewCallLogs",
      "canViewApplications",
      "canUpdateRiskEventReview",
      "canExportAnalytics",
    ],
  },
  {
    id: "perm-app-owner",
    name: "App Owner",
    description: "Assigned-application read access for application owners.",
    dataScope: "assigned_applications",
    capabilities: [
      "canViewOverview",
      "canViewRiskAnalytics",
      "canViewRiskEvents",
      "canViewCallLogs",
      "canViewApplications",
      "canExportAnalytics",
    ],
  },
  {
    id: "perm-platform-admin",
    name: "Platform Admin",
    description: "Global platform administration, policy, credential, setup, review, and export access.",
    dataScope: "global",
    capabilities: [
      "canViewOverview",
      "canViewRiskAnalytics",
      "canViewRiskEvents",
      "canViewCallLogs",
      "canViewApplications",
      "canViewPolicyCenter",
      "canManagePolicyCenter",
      "canViewApplicationSetup",
      "canManageApplicationSetup",
      "canCreateApplications",
      "canManageCredentials",
      "canManageUserAccess",
      "canUpdateRiskEventReview",
      "canExportAnalytics",
    ],
  },
];

// Creates anything missing and leaves existing rows untouched, so it is safe to rerun after admins edit policy.
export async function ensureReferenceData(prisma) {
  for (const [id, name, category, trigger, baseScore, defaultAction, iconName] of riskRules) {
    await prisma.riskRule.upsert({
      where: { id },
      update: {},
      create: { id, name, category, trigger, baseScore, defaultAction, iconName },
    });
  }

  for (const [id, name, scope, defaultAction, thresholds, enabled, ruleIds, scoreBands] of policyTemplates) {
    await prisma.policyTemplate.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name,
        scope,
        defaultAction,
        thresholds,
        ...scoreBands,
        enabled,
        policyRules: {
          create: ruleIds.map((riskRuleId) => ({ id: `${id}-${riskRuleId}`, riskRuleId })),
        },
      },
    });
  }

  for (const set of permissionSets) {
    await prisma.permissionSet.upsert({
      where: { id: set.id },
      update: {},
      create: {
        id: set.id,
        name: set.name,
        description: set.description,
        dataScope: set.dataScope,
        capabilities: {
          create: set.capabilities.map((capability) => ({ id: `${set.id}-${capability}`, capability })),
        },
      },
    });
  }

  return {
    riskRules: riskRules.length,
    policyTemplates: policyTemplates.length,
    permissionSets: permissionSets.length,
  };
}
