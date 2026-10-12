import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import {
  emptySeverityCounts,
  normalizeTrendPeriod,
  percentage,
  severityLevels,
  trendBucket,
} from "@/lib/api/overview";
import { scopedRiskEventWhere, scopeResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await authorizeRequest(request, "canViewOverview");

  if (!access.ok) {
    return access.response;
  }

  const { scope } = access;
  const period = normalizeTrendPeriod(searchParams.get("period"));

  const riskEvents = await prisma.riskEvent.findMany({
    where: scopedRiskEventWhere(scope),
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      level: true,
    },
  });

  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      total: number;
      severity: Record<(typeof severityLevels)[number], number>;
    }
  >();

  for (const event of riskEvents) {
    const bucket = trendBucket(event.occurredAt, period);
    const existing = buckets.get(bucket.key) ?? {
      key: bucket.key,
      label: bucket.label,
      total: 0,
      severity: emptySeverityCounts(),
    };

    existing.total += 1;
    if (severityLevels.includes(event.level as (typeof severityLevels)[number])) {
      existing.severity[event.level as (typeof severityLevels)[number]] += 1;
    }
    buckets.set(bucket.key, existing);
  }

  return apiOk({
    scope: scopeResponse(scope),
    period,
    data: Array.from(buckets.values()).map((bucket) => ({
      ...bucket,
      highSevereRate: percentage(bucket.severity.high + bucket.severity.severe, bucket.total),
    })),
  });
}

