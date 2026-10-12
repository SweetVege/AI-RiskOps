import { authorizeRequest } from "@/lib/api/authorize";
import { analyticsFilterResponse, analyticsFiltersFromSearchParams, applicationAnalytics, loadAnalyticsDataset } from "@/lib/api/analytics";
import { apiError, apiOk } from "@/lib/api/response";
import { scopedApplicationWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewRiskAnalytics");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const filters = {
    ...analyticsFiltersFromSearchParams(searchParams),
    applicationId: id,
  };

  const application = await prisma.application.findFirst({
    where: scopedApplicationWhere(scope, id),
    select: {
      id: true,
      name: true,
      ownerTeam: true,
      status: true,
      fieldCoverage: true,
    },
  });

  if (!application) {
    return apiError(404, "NOT_FOUND", "Application not found or outside current scope.", { id });
  }

  const { riskEvents, callLogs } = await loadAnalyticsDataset(scope, filters);

  return apiOk({
    scope: scopeResponse(scope),
    filters: analyticsFilterResponse(filters),
    data: applicationAnalytics(application, riskEvents, callLogs),
  });
}
