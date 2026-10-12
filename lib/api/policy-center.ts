import { isBaselineRule } from "@/lib/policy/effective-policy";
export function formatPolicyTemplate(template: {
  id: string;
  name: string;
  scope: string;
  defaultAction: string;
  thresholds: string;
  enabled: boolean;
  policyRules: Array<{
    enabled: boolean;
    riskRuleId: string;
  }>;
  applications: Array<{
    id: string;
  }>;
}) {
  return {
    id: template.id,
    name: template.name,
    scope: template.scope,
    defaultAction: template.defaultAction,
    thresholds: template.thresholds,
    enabled: template.enabled,
    ruleCount: template.policyRules.length,
    enabledRuleCount: template.policyRules.filter((rule) => rule.enabled).length,
    appliedApplicationCount: template.applications.length,
  };
}

export function formatPolicyRule(policyRule: {
  id: string;
  enabled: boolean;
  thresholdOverride: number | null;
  actionOverride: string | null;
  riskRule: {
    id: string;
    name: string;
    category: string;
    trigger: string;
    baseScore: number;
    defaultAction: string;
    iconName: string;
    operationalStat: {
      hits24h: number;
      reviewedFalsePositiveRate: number;
    } | null;
  };
  policyTemplate: {
    id: string;
    name: string;
  };
}) {
  return {
    id: policyRule.id,
    enabled: policyRule.enabled,
    thresholdOverride: policyRule.thresholdOverride,
    actionOverride: policyRule.actionOverride,
    policyTemplate: policyRule.policyTemplate,
    riskRule: {
      id: policyRule.riskRule.id,
      baseline: isBaselineRule(policyRule.riskRule.id),
      name: policyRule.riskRule.name,
      category: policyRule.riskRule.category,
      trigger: policyRule.riskRule.trigger,
      baseScore: policyRule.riskRule.baseScore,
      defaultAction: policyRule.riskRule.defaultAction,
      iconName: policyRule.riskRule.iconName,
    },
    operationalStat: {
      hits24h: policyRule.riskRule.operationalStat?.hits24h ?? 0,
      reviewedFalsePositiveRate: policyRule.riskRule.operationalStat?.reviewedFalsePositiveRate ?? 0,
    },
  };
}
