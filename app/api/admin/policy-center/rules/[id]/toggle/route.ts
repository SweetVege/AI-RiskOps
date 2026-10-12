import { authorizeRequest } from "@/lib/api/authorize";
import { formatPolicyRule } from "@/lib/api/policy-center";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { baselineRuleIds, isBaselineRule } from "@/lib/policy/effective-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function readToggleBody(request: Request) {
  try {
    return (await request.json()) as { enabled?: unknown };
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManagePolicyCenter"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManagePolicyCenter"));
  }

  const { id } = await params;
  const existingRules = await prisma.policyRule.findMany({
    where: { riskRuleId: id },
    select: { enabled: true },
  });

  if (existingRules.length === 0) {
    return apiError(404, "NOT_FOUND", `Risk rule ${id} was not found in any policy template.`);
  }

  const body = await readToggleBody(request);
  const isCurrentlyEnabled = existingRules.some((rule) => rule.enabled);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : !isCurrentlyEnabled;

  if (!enabled && isBaselineRule(id)) {
    return apiError(400, "BAD_REQUEST", `${id} is an enterprise baseline rule and cannot be disabled.`, {
      baselineRuleIds,
    });
  }

  const updatedRules = await prisma.$transaction(async (tx) => {
    await tx.policyRule.updateMany({
      where: { riskRuleId: id },
      data: { enabled },
    });
    await tx.ruleOperationalStat.updateMany({
      where: { riskRuleId: id },
      data: { enabled },
    });

    return tx.policyRule.findMany({
      where: { riskRuleId: id },
      orderBy: { policyTemplateId: "asc" },
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
    });
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      riskRuleId: id,
      enabled,
      policyRules: updatedRules.map(formatPolicyRule),
    },
  });
}
