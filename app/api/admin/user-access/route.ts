import { authorizeRequest } from "@/lib/api/authorize";
import { capabilityErrorMessage, hasCapability } from "@/lib/api/permissions";
import { apiError, apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function assignmentId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function auditId() {
  return `access-audit-${crypto.randomUUID().slice(0, 8)}`;
}

function profileFromPermissionSet(permissionSetName: string) {
  if (permissionSetName === "Platform Admin") return "Platform Admin";
  if (permissionSetName === "App Owner") return "App Owner";
  return "Global User";
}

function parseApplicationIds(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function formatPermissionSet(permissionSet: {
  id: string;
  name: string;
  description: string;
  dataScope: string;
  capabilities: Array<{ capability: string }>;
}) {
  return {
    id: permissionSet.id,
    name: permissionSet.name,
    description: permissionSet.description,
    dataScope: permissionSet.dataScope,
    capabilities: permissionSet.capabilities
      .map((item) => item.capability)
      .sort((a, b) => a.localeCompare(b)),
  };
}

function formatUserAccess(user: {
  id: string;
  email: string;
  name: string;
  updatedAt: Date;
  profiles: Array<{ profile: string }>;
  permissionSets: Array<{
    permissionSet: {
      id: string;
      name: string;
      description: string;
      dataScope: string;
      capabilities: Array<{ capability: string }>;
    };
  }>;
  applicationAccess: Array<{
    permission: string;
    application: {
      id: string;
      name: string;
      slug: string;
      ownerTeam: string;
    };
  }>;
}) {
  const permissionSet = user.permissionSets[0]?.permissionSet ?? null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profile: user.profiles[0]?.profile ?? (permissionSet ? profileFromPermissionSet(permissionSet.name) : "Global User"),
    permissionSet: permissionSet ? formatPermissionSet(permissionSet) : null,
    dataScope: permissionSet?.dataScope ?? "global",
    assignedApplications: user.applicationAccess
      .map((access) => ({
        id: access.application.id,
        name: access.application.name,
        slug: access.application.slug,
        ownerTeam: access.application.ownerTeam,
        permission: access.permission,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function formatAccessAuditLog(log: {
  id: string;
  occurredAt: Date;
  action: string;
  actorUserId: string;
  actorProfile: string | null;
  targetUserId: string;
  previousPermissionSetId: string | null;
  previousPermissionSetName: string | null;
  nextPermissionSetId: string | null;
  nextPermissionSetName: string | null;
  previousApplicationIds: string;
  nextApplicationIds: string;
}) {
  return {
    id: log.id,
    occurredAt: log.occurredAt.toISOString(),
    action: log.action,
    actorUserId: log.actorUserId,
    actorProfile: log.actorProfile,
    targetUserId: log.targetUserId,
    previousPermissionSet: log.previousPermissionSetId
      ? {
          id: log.previousPermissionSetId,
          name: log.previousPermissionSetName,
        }
      : null,
    nextPermissionSet: log.nextPermissionSetId
      ? {
          id: log.nextPermissionSetId,
          name: log.nextPermissionSetName,
        }
      : null,
    previousApplicationIds: parseApplicationIds(log.previousApplicationIds),
    nextApplicationIds: parseApplicationIds(log.nextApplicationIds),
  };
}

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManageUserAccess"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManageUserAccess"));
  }

  const [users, permissionSets, applications, accessAuditLogs] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        profiles: {
          orderBy: { createdAt: "asc" },
        },
        permissionSets: {
          include: {
            permissionSet: {
              include: {
                capabilities: true,
              },
            },
          },
        },
        applicationAccess: {
          include: {
            application: {
              select: {
                id: true,
                name: true,
                slug: true,
                ownerTeam: true,
              },
            },
          },
        },
      },
    }),
    prisma.permissionSet.findMany({
      orderBy: { name: "asc" },
      include: {
        capabilities: true,
      },
    }),
    prisma.application.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerTeam: true,
        status: true,
      },
    }),
    prisma.accessAuditLog.findMany({
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
  ]);

  const userRows = users.map(formatUserAccess);

  return apiOk({
    scope: scopeResponse(scope),
    summary: {
      totalUsers: userRows.length,
      permissionSets: permissionSets.length,
      appScopedUsers: userRows.filter((user) => user.dataScope === "assigned_applications").length,
      adminUsers: userRows.filter((user) => user.permissionSet?.capabilities.includes("canManageUserAccess")).length,
    },
    data: {
      users: userRows,
      permissionSets: permissionSets.map(formatPermissionSet),
      applications,
      accessAuditLogs: accessAuditLogs.map(formatAccessAuditLog),
    },
  });
}

export async function PATCH(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  if (!(await hasCapability(scope, "canManageUserAccess"))) {
    return apiError(403, "FORBIDDEN", capabilityErrorMessage("canManageUserAccess"));
  }

  const body = await request.json().catch(() => null) as {
    userId?: unknown;
    permissionSetId?: unknown;
    applicationIds?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const permissionSetId = typeof body?.permissionSetId === "string" ? body.permissionSetId.trim() : "";
  const applicationIds = Array.isArray(body?.applicationIds)
    ? Array.from(new Set(body.applicationIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())))
    : [];

  if (!userId || !permissionSetId) {
    return apiError(400, "VALIDATION_ERROR", "User ID and permission set ID are required.", {
      required: ["userId", "permissionSetId"],
    });
  }

  const [user, permissionSet, applications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        permissionSets: {
          include: {
            permissionSet: true,
          },
        },
        applicationAccess: {
          select: {
            applicationId: true,
          },
        },
      },
    }),
    prisma.permissionSet.findUnique({
      where: { id: permissionSetId },
      include: { capabilities: true },
    }),
    applicationIds.length
      ? prisma.application.findMany({
          where: { id: { in: applicationIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (!user) {
    return apiError(404, "NOT_FOUND", "User not found.", { userId });
  }

  if (!permissionSet) {
    return apiError(404, "NOT_FOUND", "Permission set not found.", { permissionSetId });
  }

  if (applications.length !== applicationIds.length) {
    return apiError(400, "VALIDATION_ERROR", "One or more assigned applications were not found.", {
      applicationIds,
      foundApplicationIds: applications.map((application) => application.id),
    });
  }

  if (permissionSet.dataScope === "assigned_applications" && applicationIds.length === 0) {
    return apiError(400, "VALIDATION_ERROR", "Assigned-application permission sets require at least one application.");
  }

  const previousPermissionSet = user.permissionSets[0]?.permissionSet ?? null;
  const previousApplicationIds = user.applicationAccess
    .map((access) => access.applicationId)
    .sort((a, b) => a.localeCompare(b));
  const nextApplicationIds = permissionSet.dataScope === "assigned_applications"
    ? applicationIds.slice().sort((a, b) => a.localeCompare(b))
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.userPermissionSetAssignment.deleteMany({ where: { userId } });
    await tx.userPermissionSetAssignment.create({
      data: {
        id: assignmentId("user-perm"),
        userId,
        permissionSetId,
      },
    });

    await tx.userApplicationAccess.deleteMany({ where: { userId } });

    if (permissionSet.dataScope === "assigned_applications") {
      await tx.userApplicationAccess.createMany({
        data: applicationIds.map((applicationId) => ({
          id: assignmentId("user-app"),
          userId,
          applicationId,
          permission: "manage",
        })),
      });
    }

    await tx.userProfileAssignment.deleteMany({ where: { userId } });
    await tx.userProfileAssignment.create({
      data: {
        id: assignmentId("profile"),
        userId,
        profile: profileFromPermissionSet(permissionSet.name),
      },
    });

    await tx.accessAuditLog.create({
      data: {
        id: auditId(),
        action: "user_access.updated",
        actorUserId: scope.userId,
        actorProfile: scope.profile,
        targetUserId: userId,
        previousPermissionSetId: previousPermissionSet?.id ?? null,
        previousPermissionSetName: previousPermissionSet?.name ?? null,
        nextPermissionSetId: permissionSet.id,
        nextPermissionSetName: permissionSet.name,
        previousApplicationIds: JSON.stringify(previousApplicationIds),
        nextApplicationIds: JSON.stringify(nextApplicationIds),
      },
    });
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profiles: {
        orderBy: { createdAt: "asc" },
      },
      permissionSets: {
        include: {
          permissionSet: {
            include: {
              capabilities: true,
            },
          },
        },
      },
      applicationAccess: {
        include: {
          application: {
            select: {
              id: true,
              name: true,
              slug: true,
              ownerTeam: true,
            },
          },
        },
      },
    },
  });

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      user: updatedUser ? formatUserAccess(updatedUser) : null,
    },
  });
}
