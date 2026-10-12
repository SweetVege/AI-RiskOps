import type { ApiProfile, RequestScope } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export type ApiPermissions = {
  dataScope: "global" | "assigned_applications";
  canViewOverview: boolean;
  canViewRiskAnalytics: boolean;
  canViewRiskEvents: boolean;
  canViewCallLogs: boolean;
  canViewApplications: boolean;
  canViewPolicyCenter: boolean;
  canManagePolicyCenter: boolean;
  canViewApplicationSetup: boolean;
  canManageApplicationSetup: boolean;
  canCreateApplications: boolean;
  canManageCredentials: boolean;
  canManageUserAccess: boolean;
  canUpdateRiskEventReview: boolean;
  canExportAnalytics: boolean;
};

export function permissionsForProfile(profile: ApiProfile): ApiPermissions {
  const isAdmin = profile === "platform-admin";
  const isGlobalUser = profile === "global-user";

  return {
    dataScope: profile === "app-owner" ? "assigned_applications" : "global",
    canViewOverview: true,
    canViewRiskAnalytics: true,
    canViewRiskEvents: true,
    canViewCallLogs: true,
    canViewApplications: true,
    canViewPolicyCenter: isAdmin,
    canManagePolicyCenter: isAdmin,
    canViewApplicationSetup: isAdmin,
    canManageApplicationSetup: isAdmin,
    canCreateApplications: isAdmin,
    canManageCredentials: isAdmin,
    canManageUserAccess: isAdmin,
    canUpdateRiskEventReview: isAdmin || isGlobalUser,
    canExportAnalytics: true,
  };
}

export const capabilityKeys = [
  "canViewOverview",
  "canViewRiskAnalytics",
  "canViewRiskEvents",
  "canViewCallLogs",
  "canViewApplications",
  "canViewPolicyCenter",
  "canManagePolicyCenter",
  "canViewApplicationSetup",
  "canManageApplicationSetup",
  "canCreateApplications",
  "canManageCredentials",
  "canManageUserAccess",
  "canUpdateRiskEventReview",
  "canExportAnalytics",
] as const satisfies ReadonlyArray<ApiCapability>;

type PermissionSetAssignment = {
  permissionSet: {
    dataScope: string;
    capabilities: Array<{ capability: string }>;
  };
};

export function permissionsFromAssignments(assignments: PermissionSetAssignment[]): ApiPermissions {
  const granted = new Set(assignments.flatMap((assignment) =>
    assignment.permissionSet.capabilities.map((capability) => capability.capability),
  ));
  // A user with no permission set has no capabilities and no application scope.
  const dataScope = !assignments.length || assignments.some((assignment) => assignment.permissionSet.dataScope === "assigned_applications")
    ? "assigned_applications"
    : "global";

  return {
    dataScope,
    ...Object.fromEntries(capabilityKeys.map((capability) => [capability, granted.has(capability)])),
  } as ApiPermissions;
}

export async function permissionsForScope(scope: RequestScope): Promise<ApiPermissions> {
  if (scope.permissions) {
    return scope.permissions;
  }

  const assignments = await prisma.userPermissionSetAssignment.findMany({
    where: { userId: scope.userId },
    include: {
      permissionSet: {
        include: {
          capabilities: true,
        },
      },
    },
  });

  if (!assignments.length) {
    return permissionsForProfile(scope.profile);
  }

  return permissionsFromAssignments(assignments);
}

export type ApiCapability = {
  [Key in keyof ApiPermissions]: ApiPermissions[Key] extends boolean ? Key : never;
}[keyof ApiPermissions];

export async function hasCapability(scope: RequestScope, capability: ApiCapability) {
  return (await permissionsForScope(scope))[capability];
}

export function capabilityErrorMessage(capability: ApiCapability) {
  const labels: Record<ApiCapability, string> = {
    canViewOverview: "view Overview",
    canViewRiskAnalytics: "view Risk Analytics",
    canViewRiskEvents: "view Risk Events",
    canViewCallLogs: "view Call Logs",
    canViewApplications: "view Applications",
    canViewPolicyCenter: "view Policy Center",
    canManagePolicyCenter: "manage Policy Center",
    canViewApplicationSetup: "view Application Setup",
    canManageApplicationSetup: "manage Application Setup",
    canCreateApplications: "create applications",
    canManageCredentials: "manage application credentials",
    canManageUserAccess: "manage user access",
    canUpdateRiskEventReview: "update risk event review metadata",
    canExportAnalytics: "export analytics reports",
  };

  return `This profile cannot ${labels[capability]}.`;
}
