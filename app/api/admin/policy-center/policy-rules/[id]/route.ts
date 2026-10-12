import { z } from "zod";
import { authorizeRequest } from "@/lib/api/authorize";
import { formatPolicyRule } from "@/lib/api/policy-center";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { isBaselineRule, maxActionThreshold, minActionThreshold } from "@/lib/policy/effective-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const overrideSchema = z.object({
  actionOverride: z.enum(["flag", "redact", "review", "block"]).nullable().optional(),
  thresholdOverride: z.number().int().min(minActionThreshold).max(maxActionThreshold).nullable().optional(),
}).refine((value) => value.actionOverride !== undefined || value.thresholdOverride !== undefined, {
  message: "Provide actionOverride or thresholdOverride.",
});

// Tunes one rule inside one policy template: which action it takes and from which total score.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeRequest(request, "canManagePolicyCenter");

  if (!access.ok) {
    return access.response;
  }

  const { id } = await params;
  const parsed = overrideSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Policy rule override failed validation.", {
      issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      thresholdRange: [minActionThreshold, maxActionThreshold],
    });
  }

  const existing = await prisma.policyRule.findUnique({ where: { id }, select: { riskRuleId: true } });

  if (!existing) {
    return apiError(404, "NOT_FOUND", "Policy rule not found.", { id });
  }

  if (parsed.data.thresholdOverride != null && isBaselineRule(existing.riskRuleId)) {
    return apiError(
      400,
      "BAD_REQUEST",
      `${existing.riskRuleId} is an enterprise baseline rule, so its action cannot be held behind a score threshold.`,
    );
  }

  const policyRule = await prisma.policyRule.update({
    where: { id },
    data: {
      ...(parsed.data.actionOverride !== undefined ? { actionOverride: parsed.data.actionOverride } : {}),
      ...(parsed.data.thresholdOverride !== undefined ? { thresholdOverride: parsed.data.thresholdOverride } : {}),
    },
    include: {
      policyTemplate: { select: { id: true, name: true } },
      riskRule: { include: { operationalStat: true } },
    },
  });

  return apiOk({
    scope: scopeResponse(access.scope),
    data: formatPolicyRule(policyRule),
  });
}
