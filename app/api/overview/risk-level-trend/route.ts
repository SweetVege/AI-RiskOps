import { authorizeRequest } from "@/lib/api/authorize";
import { apiOk } from "@/lib/api/response";
import {
  emptySeverityCounts,
  normalizeTrendPeriod,
  percentage,
  severityLevels,
  trendBucket,
} from "@/lib/api/overview";
import { scopeResponse } from "@/lib/api/scope";
import { Prisma } from "@prisma/client";
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

  const unit = period === "monthly" ? "month" : period === "quarterly" ? "quarter" : "day";
  const scopeFilter = scope.isGlobal
    ? Prisma.empty
    : scope.applicationIds?.length
      ? Prisma.sql`WHERE "applicationId" IN (${Prisma.join(scope.applicationIds)})`
      : Prisma.sql`WHERE FALSE`;
  // occurredAt is stored in UTC, so truncating in the database matches the UTC buckets the API reports.
  const rows = await prisma.$queryRaw<Array<{ bucket: string; level: string; count: number }>>`
    SELECT to_char(date_trunc(${unit}, "occurredAt"), 'YYYY-MM-DD') AS bucket, "level", COUNT(*)::int AS count
    FROM "RiskEvent"
    ${scopeFilter}
    GROUP BY 1, 2
    ORDER BY 1
  `;

  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      total: number;
      severity: Record<(typeof severityLevels)[number], number>;
    }
  >();

  for (const row of rows) {
    const bucket = trendBucket(new Date(`${row.bucket}T00:00:00.000Z`), period);
    const existing = buckets.get(bucket.key) ?? {
      key: bucket.key,
      label: bucket.label,
      total: 0,
      severity: emptySeverityCounts(),
    };

    existing.total += row.count;
    if (severityLevels.includes(row.level as (typeof severityLevels)[number])) {
      existing.severity[row.level as (typeof severityLevels)[number]] += row.count;
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

