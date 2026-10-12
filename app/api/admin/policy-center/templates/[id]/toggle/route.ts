import { authorizeRequest } from "@/lib/api/authorize";
import { formatPolicyTemplate } from "@/lib/api/policy-center";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
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
  const template = await prisma.policyTemplate.findUnique({
    where: { id },
    select: { enabled: true },
  });

  if (!template) {
    return apiError(404, "NOT_FOUND", `Policy template ${id} was not found.`);
  }

  const body = await readToggleBody(request);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : !template.enabled;

  const updatedTemplate = await prisma.policyTemplate.update({
    where: { id },
    data: { enabled },
    include: {
      policyRules: true,
      applications: {
        select: { id: true },
      },
    },
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      template: formatPolicyTemplate(updatedTemplate),
    },
  });
}
