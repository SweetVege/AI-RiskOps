import { authorizeRequest } from "@/lib/api/authorize";
import { formatCredential } from "@/lib/api/application-credentials";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
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
    return apiOk({
      scope: scopeResponse(scope),
      data: {
        credential: formatCredential(existingCredential),
      },
    });
  }

  const credential = await prisma.applicationCredential.update({
    where: { id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
    },
    include: {
      application: true,
    },
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      credential: formatCredential(credential),
    },
  });
}
