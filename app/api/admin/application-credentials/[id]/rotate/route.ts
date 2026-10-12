import { authorizeRequest } from "@/lib/api/authorize";
import {
  credentialId,
  formatCredential,
  generateApplicationCredentialSecret,
  normalizeCredentialSource,
} from "@/lib/api/application-credentials";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiCreated, apiError } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManageCredentials"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManageCredentials"));
  }

  const existingCredential = await prisma.applicationCredential.findUnique({
    where: { id },
    include: { application: true },
  });

  if (!existingCredential) {
    return apiError(404, "NOT_FOUND", "Credential not found.", { id });
  }

  if (existingCredential.status === "revoked") {
    return apiError(400, "VALIDATION_ERROR", "Revoked credentials cannot be rotated. Generate a new credential instead.", {
      id,
      status: existingCredential.status,
    });
  }

  const generated = generateApplicationCredentialSecret(normalizeCredentialSource(existingCredential.integrationSource));
  const now = new Date();
  const newCredential = await prisma.$transaction(async (tx) => {
    await tx.applicationCredential.update({
      where: { id },
      data: {
        status: "revoked",
        revokedAt: now,
        rotatedAt: now,
      },
    });

    return tx.applicationCredential.create({
      data: {
        id: credentialId(),
        applicationId: existingCredential.applicationId,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        status: "active",
        integrationSource: existingCredential.integrationSource,
        createdBy: scope.userId,
        rotatedAt: now,
      },
      include: {
        application: true,
      },
    });
  });

  return apiCreated({
    scope: scopeResponse(scope),
    data: {
      credential: formatCredential(newCredential),
      previousCredentialId: id,
      secret: generated.secret,
    },
  });
}
