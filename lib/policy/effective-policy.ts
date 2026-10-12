import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RiskAction } from "@/lib/risk-data";
import type { EvaluationPolicy, PolicyRuleSetting } from "@/lib/risk-engine";

// Enterprise baseline: enforced for every application regardless of its policy template.
export const baselineRuleIds: readonly string[] = ["DLP-002", "ACCESS-001", "TOOL-001", "SYS-001"];

const riskActions: readonly string[] = ["allow", "flag", "redact", "review", "block"];

type CatalogRule = {
  id: string;
  name: string;
  category: string;
  baseScore: number;
  defaultAction: string;
};

type TemplateRule = {
  riskRuleId: string;
  enabled: boolean;
  actionOverride: string | null;
};

export type EffectivePolicy = EvaluationPolicy & {
  templateId: string | null;
  activeRuleIds: string[];
};

export function isBaselineRule(ruleId: string) {
  return baselineRuleIds.includes(ruleId);
}

function toAction(value: string | null | undefined): RiskAction | null {
  return value && riskActions.includes(value) ? (value as RiskAction) : null;
}

// An application without a template gets every catalog rule. With a template, a rule is active when the
// template enables it or it is a baseline rule. A disabled template keeps applying to applications already
// bound to it; disabling only stops new applications from selecting it.
export function buildEffectivePolicy(
  catalog: CatalogRule[],
  template: { id: string; policyRules: TemplateRule[] } | null,
): EffectivePolicy {
  const templateRules = new Map(template?.policyRules.map((rule) => [rule.riskRuleId, rule]));
  const rules = new Map<string, PolicyRuleSetting>();

  for (const rule of catalog) {
    const templateRule = templateRules.get(rule.id);
    const isActive = !template || isBaselineRule(rule.id) || templateRule?.enabled === true;

    if (!isActive) continue;

    rules.set(rule.id, {
      name: rule.name,
      category: rule.category,
      baseScore: rule.baseScore,
      action: toAction(templateRule?.enabled ? templateRule.actionOverride : null) ?? toAction(rule.defaultAction) ?? "flag",
    });
  }

  return {
    rules,
    templateId: template?.id ?? null,
    activeRuleIds: [...rules.keys()],
  };
}

export async function loadEffectivePolicy(
  policyTemplateId: string | null,
  db: Prisma.TransactionClient = prisma,
): Promise<EffectivePolicy> {
  const [catalog, policyRules] = await Promise.all([
    db.riskRule.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, category: true, baseScore: true, defaultAction: true },
    }),
    policyTemplateId
      ? db.policyRule.findMany({
          where: { policyTemplateId },
          select: { riskRuleId: true, enabled: true, actionOverride: true },
        })
      : null,
  ]);

  return buildEffectivePolicy(
    catalog,
    policyTemplateId && policyRules ? { id: policyTemplateId, policyRules } : null,
  );
}
