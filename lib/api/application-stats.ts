import { prisma } from "@/lib/prisma";

export type ApplicationRiskStats = {
  callLogCount: number;
  riskEventCount: number;
  severeCount: number;
  highCount: number;
  blockedCount: number;
  scoreTotal: number;
  maxRiskScore: number;
  latestEventAt: Date | null;
};

function emptyStats(): ApplicationRiskStats {
  return {
    callLogCount: 0,
    riskEventCount: 0,
    severeCount: 0,
    highCount: 0,
    blockedCount: 0,
    scoreTotal: 0,
    maxRiskScore: 0,
    latestEventAt: null,
  };
}

// Per-application counts computed in the database so list views never load event or call rows.
export async function loadApplicationRiskStats(applicationIds: string[]) {
  const where = { applicationId: { in: applicationIds } };
  const [eventGroups, callGroups] = await Promise.all([
    prisma.riskEvent.groupBy({
      by: ["applicationId", "level", "action"],
      where,
      _count: { _all: true },
      _sum: { score: true },
      _max: { score: true, occurredAt: true },
    }),
    prisma.aiCallLog.groupBy({
      by: ["applicationId"],
      where,
      _count: { _all: true },
    }),
  ]);
  const stats = new Map(applicationIds.map((id) => [id, emptyStats()]));

  for (const group of eventGroups) {
    const entry = stats.get(group.applicationId);
    if (!entry) continue;

    const count = group._count._all;
    const latest = group._max.occurredAt;

    entry.riskEventCount += count;
    entry.scoreTotal += group._sum.score ?? 0;
    entry.maxRiskScore = Math.max(entry.maxRiskScore, group._max.score ?? 0);
    if (group.level === "severe") entry.severeCount += count;
    if (group.level === "high") entry.highCount += count;
    if (group.action === "block") entry.blockedCount += count;
    if (latest && (!entry.latestEventAt || latest > entry.latestEventAt)) entry.latestEventAt = latest;
  }

  for (const group of callGroups) {
    const entry = stats.get(group.applicationId);
    if (entry) entry.callLogCount = group._count._all;
  }

  return {
    get: (applicationId: string) => stats.get(applicationId) ?? emptyStats(),
  };
}
