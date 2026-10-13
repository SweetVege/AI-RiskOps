import type { Prisma } from "@prisma/client";
import { scoreBandsForTemplate, type ScoreBands } from "@/lib/policy/score-bands";
import { prisma } from "@/lib/prisma";
import type { RiskAction } from "@/lib/risk-data";
import type { EvaluationPolicy, PolicyRuleSetting } from "@/lib/risk-engine";

// Enterprise baseline: enforced for every application regardless of its policy template.
export const baselineRuleIds: readonly string[] = ["PI-001", "PI-002", "DLP-002", "ACCESS-001", "TOOL-001", "SYS-001"];

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
  thresholdOverride: number | null;
};

export type EffectivePolicy = EvaluationPolicy & {
  scoreBands: ScoreBands;
  templateId: string | null;
  activeRuleIds: string[];
};

export function isBaselineRule(ruleId: string) {
  return baselineRuleIds.includes(ruleId);
}

function toAction(value: string | null | undefined): RiskAction | null {
  return value && riskActions.includes(value) ? (value as RiskAction) : null;
}

export const minActionThreshold = 1;
export const maxActionThreshold = 100;

// Baseline rules must always act, so a threshold on one is ignored even if it reaches the database.
function toActionThreshold(ruleId: string, value: number | null) {
  if (value === null || isBaselineRule(ruleId)) return undefined;

  return value >= minActionThreshold && value <= maxActionThreshold ? value : undefined;
}

// An application without a template gets every catalog rule. With a template, a rule is active when the
// template enables it or it is a baseline rule. A disabled template keeps applying to applications already
// bound to it; disabling only stops new applications from selecting it.
export function buildEffectivePolicy(
  catalog: CatalogRule[],
  template: {
    id: string;
    policyRules: TemplateRule[];
    reviewAtScore?: number | null;
    blockAtScore?: number | null;
    escalateAtScore?: number | null;
  } | null,
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
      actionThreshold: templateRule?.enabled ? toActionThreshold(rule.id, templateRule.thresholdOverride) : undefined,
    });
  }

  return {
    rules,
    scoreBands: scoreBandsForTemplate(template && {
      reviewAtScore: template.reviewAtScore ?? null,
      blockAtScore: template.blockAtScore ?? null,
      escalateAtScore: template.escalateAtScore ?? null,
    }),
    templateId: template?.id ?? null,
    activeRuleIds: [...rules.keys()],
  };
}

export async function loadEffectivePolicy(
  policyTemplateId: string | null,
  db: Prisma.TransactionClient = prisma,
): Promise<EffectivePolicy> {
  const [catalog, template] = await Promise.all([
    db.riskRule.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, category: true, baseScore: true, defaultAction: true },
    }),
    policyTemplateId
      ? db.policyTemplate.findUnique({
          where: { id: policyTemplateId },
          select: {
            id: true,
            reviewAtScore: true,
            blockAtScore: true,
            escalateAtScore: true,
            policyRules: {
              select: { riskRuleId: true, enabled: true, actionOverride: true, thresholdOverride: true },
            },
          },
        })
      : null,
  ]);

  return buildEffectivePolicy(catalog, template);
}
