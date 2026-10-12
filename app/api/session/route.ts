import { authorizeRequest } from "@/lib/api/authorize";
import { permissionsForScope } from "@/lib/api/permissions";
import { apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorizeRequest(request);

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;

  return apiOk({
    scope: scopeResponse(scope),
    data: {
      demoMode: scope.isDemo,
      user: scope.user ?? null,
      profile: scope.profile,
      userId: scope.userId,
      permissions: await permissionsForScope(scope),
    },
  });
}
