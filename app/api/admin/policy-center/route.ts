import { authorizeRequest } from "@/lib/api/authorize";
import { formatPolicyRule, formatPolicyTemplate } from "@/lib/api/policy-center";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canViewPolicyCenter"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canViewPolicyCenter"));
  }

  const [templates, policyRules] = await Promise.all([
    prisma.policyTemplate.findMany({
      orderBy: { name: "asc" },
      include: {
        policyRules: true,
        applications: {
          select: { id: true },
        },
      },
    }),
    prisma.policyRule.findMany({
      orderBy: [
        { riskRuleId: "asc" },
        { policyTemplateId: "asc" },
      ],
      include: {
        policyTemplate: {
          select: {
            id: true,
            name: true,
          },
        },
        riskRule: {
          include: {
            operationalStat: true,
          },
        },
      },
    }),
  ]);

  const ruleStatsById = new Map<
    string,
    {
      isEnabled: boolean;
      hits24h: number;
      reviewedFalsePositiveRate: number;
    }
  >();

  policyRules.forEach((rule) => {
    const existing = ruleStatsById.get(rule.riskRuleId);
    const hits24h = rule.riskRule.operationalStat?.hits24h ?? 0;
    const reviewedFalsePositiveRate = rule.riskRule.operationalStat?.reviewedFalsePositiveRate ?? 0;

    if (existing) {
      existing.isEnabled = existing.isEnabled || rule.enabled;
      existing.hits24h = Math.max(existing.hits24h, hits24h);
      existing.reviewedFalsePositiveRate = Math.max(
        existing.reviewedFalsePositiveRate,
        reviewedFalsePositiveRate,
      );
      return;
    }

    ruleStatsById.set(rule.riskRuleId, {
      isEnabled: rule.enabled,
      hits24h,
      reviewedFalsePositiveRate,
    });
  });

  const ruleStats = Array.from(ruleStatsById.values());
  const enabledRules = ruleStats.filter((rule) => rule.isEnabled).length;
  const hits24h = ruleStats.reduce((sum, rule) => sum + rule.hits24h, 0);
  const highFalsePositiveRules = ruleStats.filter((rule) => rule.reviewedFalsePositiveRate >= 15).length;

  return apiOk({
    scope: scopeResponse(scope),
    summary: {
      policyTemplates: templates.length,
      enabledTemplates: templates.filter((template) => template.enabled).length,
      riskRules: ruleStatsById.size,
      enabledPolicyRules: enabledRules,
      hits24h,
      highFalsePositiveRules,
    },
    data: {
      templates: templates.map(formatPolicyTemplate),
      policyRules: policyRules.map(formatPolicyRule),
    },
  });
}
