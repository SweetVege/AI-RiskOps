import { randomUUID } from "crypto";
import type { SessionUser } from "@/lib/auth";
import { capabilityKeys, permissionsFromAssignments, type ApiPermissions } from "@/lib/api/permissions";
import { prisma } from "@/lib/prisma";

export type ApiProfile = "global-user" | "app-owner" | "platform-admin";

const profileToUserId: Record<ApiProfile, string> = {
  "global-user": "user-demo-global",
  "app-owner": "user-demo-owner",
  "platform-admin": "user-demo-admin",
};

const profileAliases: Record<string, ApiProfile> = {
  "global-user": "global-user",
  "global user": "global-user",
  "app-owner": "app-owner",
  "app owner": "app-owner",
  "platform-admin": "platform-admin",
  "platform admin": "platform-admin",
};

export type RequestScope = {
  profile: ApiProfile;
  userId: string;
  isGlobal: boolean;
  applicationIds?: string[];
  isDemo: boolean;
  // Present for signed-in users; demo scopes resolve permissions from the simulated profile.
  permissions?: ApiPermissions;
  user?: SessionUser;
};

export function normalizeProfile(value: string | null): ApiProfile {
  if (!value) {
    return "platform-admin";
  }

  return profileAliases[value.trim().toLowerCase()] ?? "platform-admin";
}

// Demo mode only: identity comes from the simulated profile switcher.
export async function resolveDemoScope(searchParams: URLSearchParams): Promise<RequestScope> {
  const profile = normalizeProfile(searchParams.get("profile"));
  const userId = profileToUserId[profile];

  if (profile !== "app-owner") {
    return {
      profile,
      userId,
      isGlobal: true,
      isDemo: true,
    };
  }

  const assignments = await prisma.userApplicationAccess.findMany({
    where: { userId },
    select: { applicationId: true },
  });

  return {
    profile,
    userId,
    isGlobal: false,
    applicationIds: assignments.map((assignment) => assignment.applicationId),
    isDemo: true,
  };
}

const adminPermissionSetId = "perm-platform-admin";

const userAccessInclude = {
  permissionSets: { include: { permissionSet: { include: { capabilities: true } } } },
  applicationAccess: { select: { applicationId: true } },
} as const;

function adminEmails() {
  return (process.env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Emails in AUTH_ADMIN_EMAILS become Platform Admins on first sign-in so a fresh deployment has someone
// who can grant access to everyone else.
async function grantBootstrapAdmin(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.permissionSet.upsert({
      where: { id: adminPermissionSetId },
      update: {},
      create: {
        id: adminPermissionSetId,
        name: "Platform Admin",
        description: "Global platform administration, policy, credential, setup, review, and export access.",
        dataScope: "global",
        capabilities: {
          create: capabilityKeys.map((capability) => ({ id: `${adminPermissionSetId}-${capability}`, capability })),
        },
      },
    });
    await tx.userPermissionSetAssignment.create({
      data: { id: `user-perm-${randomUUID()}`, userId, permissionSetId: adminPermissionSetId },
    });
    await tx.userProfileAssignment.create({
      data: { id: `profile-${randomUUID()}`, userId, profile: "Platform Admin" },
    });
  });
}

export async function resolveUserScope(sessionUser: SessionUser): Promise<RequestScope> {
  const where = { email: sessionUser.email };
  let user = await prisma.user.findUnique({ where, include: userAccessInclude });

  if (!user) {
    user = await prisma.user.upsert({
      where,
      update: {},
      create: { id: `user-${randomUUID()}`, email: sessionUser.email, name: sessionUser.name },
      include: userAccessInclude,
    });
  }

  if (!user.permissionSets.length && adminEmails().includes(sessionUser.email)) {
    await grantBootstrapAdmin(user.id);
    user = await prisma.user.findUniqueOrThrow({ where, include: userAccessInclude });
  }

  const permissions = permissionsFromAssignments(user.permissionSets);
  const isGlobal = permissions.dataScope === "global";

  return {
    profile: permissions.canManageUserAccess ? "platform-admin" : isGlobal ? "global-user" : "app-owner",
    userId: user.id,
    isGlobal,
    applicationIds: isGlobal ? undefined : user.applicationAccess.map((access) => access.applicationId),
    isDemo: false,
    permissions,
    user: sessionUser,
  };
}

export function scopedApplicationWhere(scope: RequestScope, applicationId?: string | null) {
  if (scope.isGlobal) {
    return applicationId ? { id: applicationId } : {};
  }

  const applicationIds = scopedApplicationIds(scope, applicationId);

  return {
    id: {
      in: applicationIds,
    },
  };
}

export function scopedRiskEventWhere(scope: RequestScope, applicationId?: string | null) {
  if (scope.isGlobal) {
    return applicationId ? { applicationId } : {};
  }

  const applicationIds = scopedApplicationIds(scope, applicationId);

  return {
    applicationId: {
      in: applicationIds,
    },
  };
}

export function scopedCallLogWhere(scope: RequestScope, applicationId?: string | null) {
  if (scope.isGlobal) {
    return applicationId ? { applicationId } : {};
  }

  const applicationIds = scopedApplicationIds(scope, applicationId);

  return {
    applicationId: {
      in: applicationIds,
    },
  };
}

export function scopeResponse(scope: RequestScope) {
  return {
    profile: scope.profile,
    userId: scope.userId,
    mode: scope.isGlobal ? "global" : "assigned_applications",
    applicationIds: scope.applicationIds,
  };
}

function scopedApplicationIds(scope: RequestScope, applicationId?: string | null) {
  const assignedIds = scope.applicationIds ?? [];

  if (!applicationId) {
    return assignedIds;
  }

  return assignedIds.includes(applicationId) ? [applicationId] : [];
}
