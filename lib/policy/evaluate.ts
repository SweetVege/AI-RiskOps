import { z } from "zod";
import { dataTypes } from "@/lib/api/ingestion-contract";
import { scopedApplicationWhere, type RequestScope } from "@/lib/api/scope";
import { maxTextFieldLength } from "@/lib/ingestion/schema";
import { loadEffectivePolicy } from "@/lib/policy/effective-policy";
import { prisma } from "@/lib/prisma";
import { evaluateAiCall } from "@/lib/risk-engine";

const label = z.string().trim().max(200);
const captured = z.string().max(maxTextFieldLength).default("");

export const policyEvaluationSchema = z.object({
  app: label.default(""),
  userRole: label.default(""),
  environment: z.enum(["Production", "Test"]).default("Production"),
  dataType: z.enum(dataTypes).default("General Data"),
  prompt: captured,
  output: captured,
  ragContext: captured,
  toolCall: captured,
  templateId: label.default("sandbox"),
});

export type PolicyEvaluationInput = z.infer<typeof policyEvaluationSchema>;

// Scores a sample call with the policy its application would get at ingestion, without storing anything.
// A name that matches no application in scope is scored against the whole rule catalog.
export async function evaluateWithApplicationPolicy(scope: RequestScope, input: PolicyEvaluationInput) {
  const application = input.app
    ? await prisma.application.findFirst({
        where: {
          AND: [
            scopedApplicationWhere(scope),
            { OR: [{ id: input.app }, { name: input.app }, { slug: input.app }] },
          ],
        },
        select: { id: true, name: true, policyTemplate: { select: { id: true, name: true } } },
      })
    : null;
  const policy = await loadEffectivePolicy(application?.policyTemplate?.id ?? null);

  return {
    evaluation: evaluateAiCall(input, policy),
    application: application ? { id: application.id, name: application.name } : null,
    policy: {
      templateId: policy.templateId,
      templateName: application?.policyTemplate?.name ?? null,
      activeRuleIds: policy.activeRuleIds,
      scoreBands: policy.scoreBands,
    },
  };
}
