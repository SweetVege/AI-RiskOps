import { authorizeRequest } from "@/lib/api/authorize";
import { formatApplicationSetup } from "@/lib/api/application-setup";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiCreated, apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const validationLabels = [
  "API key configured",
  "Call logs received",
  "Prompt captured",
  "Output captured",
  "RAG context captured",
  "Tool calls audited",
  "Policy bound",
  "Alert route configured",
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function integrationSource(value: string | null | undefined) {
  if (value === "gateway_proxy" || value === "sdk" || value === "log_api" || value === "agent_tool_audit") {
    return value;
  }

  return "sdk";
}

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canViewApplicationSetup"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canViewApplicationSetup"));
  }

  const applications = await prisma.application.findMany({
    orderBy: { name: "asc" },
    include: {
      policyTemplate: {
        select: {
          id: true,
          name: true,
        },
      },
      environments: {
        orderBy: { name: "asc" },
      },
      validationChecks: {
        orderBy: { label: "asc" },
      },
      credentials: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const setupRows = applications.map(formatApplicationSetup);
  const connectedApps = setupRows.filter((application) => application.status === "connected").length;
  const inValidationApps = setupRows.filter((application) =>
    application.status === "validating" || application.status === "pending_validation",
  ).length;
  const productionLiveApps = setupRows.filter((application) =>
    application.environments.some((environment) => environment.name === "production" && environment.status === "Live"),
  ).length;
  const avgFieldCoverage = Math.round(
    setupRows.reduce((sum, application) => sum + application.fieldCoverage, 0) / Math.max(setupRows.length, 1),
  );
  const activeCredentials = setupRows.filter((application) => application.credential.status === "active").length;
  const missingCredentials = setupRows.filter((application) => application.credential.status === "not_created").length;
  const validationPassed = setupRows.reduce(
    (sum, application) =>
      sum + application.validationChecks.filter((check) => check.status === "passed").length,
    0,
  );
  const validationTotal = setupRows.reduce(
    (sum, application) => sum + application.validationChecks.length,
    0,
  );

  return apiOk({
    scope: scopeResponse(scope),
    summary: {
      registeredApps: setupRows.length,
      connectedApps,
      inValidationApps,
      productionLiveApps,
      avgFieldCoverage,
      activeCredentials,
      missingCredentials,
      validationPassed,
      validationTotal,
    },
    data: setupRows,
  });
}

export async function POST(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canCreateApplications"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canCreateApplications"));
  }

  const body = await request.json().catch(() => null) as {
    name?: unknown;
    ownerTeam?: unknown;
    integrationMethod?: unknown;
    policyTemplateId?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const ownerTeam = typeof body?.ownerTeam === "string" ? body.ownerTeam.trim() : "";
  const method = integrationSource(typeof body?.integrationMethod === "string" ? body.integrationMethod : null);
  const policyTemplateId = typeof body?.policyTemplateId === "string" && body.policyTemplateId.trim()
    ? body.policyTemplateId.trim()
    : null;

  if (!name || !ownerTeam) {
    return apiError(400, "VALIDATION_ERROR", "Application name and owner team are required.", {
      required: ["name", "ownerTeam"],
    });
  }

  const baseSlug = slugify(name);
  if (!baseSlug) {
    return apiError(400, "VALIDATION_ERROR", "Application name must include letters or numbers.");
  }

  const existing = await prisma.application.findFirst({
    where: {
      OR: [
        { slug: baseSlug },
        { name },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return apiError(400, "VALIDATION_ERROR", "Application name or slug already exists.", {
      name,
      slug: baseSlug,
    });
  }

  if (policyTemplateId) {
    const policyTemplate = await prisma.policyTemplate.findUnique({
      where: { id: policyTemplateId },
      select: { id: true },
    });

    if (!policyTemplate) {
      return apiError(404, "NOT_FOUND", "Policy template not found.", { policyTemplateId });
    }
  }

  const applicationId = `app-${baseSlug}`;
  const createdApplication = await prisma.application.create({
    data: {
      id: applicationId,
      name,
      slug: baseSlug,
      ownerTeam,
      status: "validating",
      policyTemplateId,
      integrationMethod: method,
      fieldCoverage: 0,
      environments: {
        create: [
          {
            id: `${applicationId}-production`,
            name: "production",
            status: "Pending Cutover",
            callsToday: 0,
            lastSeenAt: null,
          },
          {
            id: `${applicationId}-test`,
            name: "test",
            status: "Validating",
            callsToday: 0,
            lastSeenAt: null,
          },
        ],
      },
      validationChecks: {
        create: validationLabels.map((label) => ({
          id: `${applicationId}-${slugify(label)}`,
          checkKey: label.toLowerCase().replaceAll(" ", "_"),
          label,
          status: policyTemplateId && label === "Policy bound" ? "passed" : "pending",
        })),
      },
    },
    include: {
      policyTemplate: {
        select: {
          id: true,
          name: true,
        },
      },
      environments: {
        orderBy: { name: "asc" },
      },
      validationChecks: {
        orderBy: { label: "asc" },
      },
      credentials: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return apiCreated({
    scope: scopeResponse(scope),
    data: formatApplicationSetup(createdApplication),
  });
}
