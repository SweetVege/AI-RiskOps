import { authorizeRequest } from "@/lib/api/authorize";
import {
  credentialId,
  formatCredential,
  generateApplicationCredentialSecret,
  normalizeCredentialSource,
} from "@/lib/api/application-credentials";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiCreated, apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as {
      applicationId?: string;
      integrationSource?: string;
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManageCredentials"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManageCredentials"));
  }

  const [applications, credentials] = await Promise.all([
    prisma.application.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerTeam: true,
        status: true,
        integrationMethod: true,
      },
    }),
    prisma.applicationCredential.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        application: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerTeam: true,
            status: true,
            integrationMethod: true,
          },
        },
      },
    }),
  ]);

  const latestCredentialByApplication = new Map<string, (typeof credentials)[number]>();

  credentials.forEach((credential) => {
    if (!latestCredentialByApplication.has(credential.applicationId)) {
      latestCredentialByApplication.set(credential.applicationId, credential);
    }
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: applications.map((application) => {
      const credential = latestCredentialByApplication.get(application.id);

      if (credential) {
        return formatCredential(credential);
      }

      return {
        id: null,
        applicationId: application.id,
        applicationName: application.name,
        applicationSlug: application.slug,
        ownerTeam: application.ownerTeam,
        applicationStatus: application.status,
        applicationIntegrationMethod: application.integrationMethod,
        keyPrefix: null,
        status: "not_created",
        integrationSource: normalizeCredentialSource(application.integrationMethod),
        createdBy: null,
        lastUsedAt: null,
        createdAt: null,
        rotatedAt: null,
        revokedAt: null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManageCredentials"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManageCredentials"));
  }

  const body = await readJsonBody(request);
  const applicationId = body?.applicationId?.trim();

  if (!applicationId) {
    return apiError(400, "VALIDATION_ERROR", "Application ID is required.", {
      required: ["applicationId"],
    });
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) {
    return apiError(404, "NOT_FOUND", "Application not found.", { applicationId });
  }

  const existingActiveCredential = await prisma.applicationCredential.findFirst({
    where: {
      applicationId,
      status: {
        in: ["active", "rotation_required"],
      },
    },
  });

  if (existingActiveCredential) {
    return apiError(400, "VALIDATION_ERROR", "Application already has an active credential. Rotate it instead.", {
      applicationId,
      credentialId: existingActiveCredential.id,
    });
  }

  const integrationSource = normalizeCredentialSource(body?.integrationSource ?? application.integrationMethod);
  const generated = generateApplicationCredentialSecret(integrationSource);
  const credential = await prisma.applicationCredential.create({
    data: {
      id: credentialId(),
      applicationId,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      status: "active",
      integrationSource,
      createdBy: scope.userId,
    },
    include: {
      application: true,
    },
  });

  return apiCreated({
    scope: scopeResponse(scope),
    data: {
      credential: formatCredential(credential),
      secret: generated.secret,
    },
  });
}
