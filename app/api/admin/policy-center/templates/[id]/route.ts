import { z } from "zod";
import { authorizeRequest } from "@/lib/api/authorize";
import { formatPolicyTemplate } from "@/lib/api/policy-center";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { maxBandScore, minBandScore, scoreBandError } from "@/lib/policy/score-bands";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const band = z.number().int().min(minBandScore).max(maxBandScore).nullable().optional();
const bandsSchema = z.object({
  reviewAt: band,
  blockAt: band,
  escalateAt: band,
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Provide reviewAt, blockAt, or escalateAt.",
});

// Sets the score bands a policy template enforces. Clearing all three returns it to the default band.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeRequest(request, "canManagePolicyCenter");

  if (!access.ok) {
    return access.response;
  }

  const { id } = await params;
  const parsed = bandsSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Score bands failed validation.", {
      issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      scoreRange: [minBandScore, maxBandScore],
    });
  }

  const existing = await prisma.policyTemplate.findUnique({
    where: { id },
    select: { reviewAtScore: true, blockAtScore: true, escalateAtScore: true },
  });

  if (!existing) {
    return apiError(404, "NOT_FOUND", "Policy template not found.", { id });
  }

  const next = {
    reviewAtScore: parsed.data.reviewAt === undefined ? existing.reviewAtScore : parsed.data.reviewAt,
    blockAtScore: parsed.data.blockAt === undefined ? existing.blockAtScore : parsed.data.blockAt,
    escalateAtScore: parsed.data.escalateAt === undefined ? existing.escalateAtScore : parsed.data.escalateAt,
  };
  const conflict = scoreBandError({
    reviewAt: next.reviewAtScore,
    blockAt: next.blockAtScore,
    escalateAt: next.escalateAtScore,
  });

  if (conflict) {
    return apiError(400, "VALIDATION_ERROR", conflict);
  }

  const template = await prisma.policyTemplate.update({
    where: { id },
    data: next,
    include: {
      policyRules: true,
      applications: { select: { id: true } },
    },
  });

  return apiOk({
    scope: scopeResponse(access.scope),
    data: formatPolicyTemplate(template),
  });
}
