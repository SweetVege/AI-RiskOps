import { authorizeRequest } from "@/lib/api/authorize";
import {
  analyticsDrilldown,
  analyticsDrilldownFromSearchParams,
  analyticsFilterResponse,
  analyticsFiltersFromSearchParams,
  loadAnalyticsDataset,
} from "@/lib/api/analytics";
import { apiOk } from "@/lib/api/response";
import { scopeResponse } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewRiskAnalytics");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const filters = analyticsFiltersFromSearchParams(searchParams);
  const drilldown = analyticsDrilldownFromSearchParams(searchParams);
  const { riskEvents } = await loadAnalyticsDataset(scope, filters);

  return apiOk({
    scope: scopeResponse(scope),
    filters: analyticsFilterResponse(filters),
    data: analyticsDrilldown(riskEvents, drilldown),
  });
}
