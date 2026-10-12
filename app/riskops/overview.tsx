import { Activity, AlertOctagon, Gauge, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type OverviewApiData,
  type OverviewCategoryApi,
  type OverviewSevereEventApi,
  type OverviewTopApplicationApi,
  type OverviewTrendBucketApi,
} from "@/app/riskops/api-types";
import { StatCard } from "@/app/riskops/components";
import { type UserProfile } from "@/app/riskops/config";
import { profileQueryValue } from "@/app/riskops/mappers";
import { levelMeta } from "@/lib/risk-data";

export type TrendPeriod = "Daily" | "Monthly" | "Quarterly";

export const categoryColorMap: Record<string, { tone: string; color: string }> = {
  "Input Attack": { tone: "bg-violet-600", color: "#7c3aed" },
  "Context Contamination": { tone: "bg-sky-600", color: "#0284c7" },
  "Data Leakage": { tone: "bg-rose-600", color: "#e11d48" },
  "Model Configuration Leakage": { tone: "bg-indigo-600", color: "#4f46e5" },
  "Agent Behavior": { tone: "bg-amber-500", color: "#f59e0b" },
  "Access Risk": { tone: "bg-teal-600", color: "#0d9488" },
  "Behavior Anomaly": { tone: "bg-orange-600", color: "#ea580c" },
  Other: { tone: "bg-slate-600", color: "#475569" },
};

export const fallbackCategoryColors = [
  { tone: "bg-lime-600", color: "#65a30d" },
  { tone: "bg-fuchsia-600", color: "#c026d3" },
  { tone: "bg-cyan-700", color: "#0e7490" },
  { tone: "bg-red-700", color: "#b91c1c" },
  { tone: "bg-emerald-600", color: "#059669" },
  { tone: "bg-blue-700", color: "#1d4ed8" },
];

export function RiskLevelTrendChart({ profile }: { profile: UserProfile }) {
  const [period, setPeriod] = useState<TrendPeriod>("Daily");
  const [trendData, setTrendData] = useState<OverviewTrendBucketApi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrend() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/overview/risk-level-trend?profile=${profileQueryValue(profile)}&period=${period.toLowerCase()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to load risk trend");
        }

        const payload = (await response.json()) as { data: OverviewTrendBucketApi[] };
        setTrendData(payload.data);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError("Unable to load risk trend");
          setTrendData([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadTrend();

    return () => controller.abort();
  }, [period, profile]);

  const visibleTrendData = period === "Daily" ? trendData.slice(-30) : trendData;
  const maxTotal = Math.max(
    ...visibleTrendData.map((item) => item.total),
    1,
  );
  const highSevereRates = visibleTrendData.map((item) => item.highSevereRate);
  const minHighSevereRate = highSevereRates.length ? Math.min(...highSevereRates) : 0;
  const maxHighSevereRate = highSevereRates.length ? Math.max(...highSevereRates) : 0;
  const rateRange = maxHighSevereRate - minHighSevereRate;
  const rateChartTop = 16;
  const rateChartBottom = 78;
  const ratePoints = visibleTrendData.map((item, index) => {
    const x = ((index + 0.5) / visibleTrendData.length) * 100;
    const normalizedRate = rateRange === 0 ? 0.5 : (item.highSevereRate - minHighSevereRate) / rateRange;
    const y = rateChartBottom - normalizedRate * (rateChartBottom - rateChartTop);
    const showLabel = visibleTrendData.length <= 12 || index === 0 || index === visibleTrendData.length - 1 || index % 5 === 0;
    return {
      x,
      y,
      rate: Math.round(item.highSevereRate),
      showLabel,
    };
  });
  const linePoints = ratePoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Risk Level Trend</h2>
          <p className="mt-1 text-xs text-slate-500">
            Event volume by severity level with High+Severe Rate overlay
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-white p-1">
          {(["Daily", "Monthly", "Quarterly"] as TrendPeriod[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`h-7 rounded-md px-3 text-xs font-medium ${
                period === item ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-6 h-80">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm font-medium text-slate-500">Loading trend data...</div>
        ) : error ? (
          <div className="grid h-full place-items-center text-sm font-medium text-rose-600">{error}</div>
        ) : visibleTrendData.length ? (
          <>
            <svg className="pointer-events-none absolute inset-x-0 top-8 z-10 h-24 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={linePoints}
                fill="none"
                stroke="#0284c7"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="pointer-events-none absolute inset-x-0 top-8 z-10 h-24">
              {ratePoints.map((point, index) => (
                <div
                  key={`${visibleTrendData[index].label}-${point.rate}`}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                >
                  {point.showLabel ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sky-700 shadow-sm ring-1 ring-sky-100">
                      {point.rate}%
                    </span>
                  ) : null}
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-600 ring-2 ring-white" />
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 grid h-56 grid-flow-col auto-cols-fr items-end">
              {visibleTrendData.map((item, index) => {
                const total = item.total;
                const showBucketLabel =
                  visibleTrendData.length <= 12 || index === 0 || index === visibleTrendData.length - 1 || index % 5 === 0;
                const tooltip = `${item.label}
Total events: ${total}
Low: ${item.severity.low}
Medium: ${item.severity.medium}
High: ${item.severity.high}
Severe: ${item.severity.severe}
High+Severe Rate: ${Math.round(item.highSevereRate)}%`;
                return (
                  <div key={item.label} className="flex min-w-0 flex-col items-center gap-2 px-1.5">
                    <div title={tooltip} className="relative h-40 w-full max-w-16">
                      <div className="absolute bottom-0 w-full" style={{ height: `${(total / maxTotal) * 100}%` }}>
                        {total ? (
                          <span className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full px-1 pb-1 text-[11px] font-semibold text-ink">
                            {total}
                          </span>
                        ) : null}
                        <div className="flex h-full w-full flex-col justify-end overflow-hidden rounded-t-md">
                          <div className="bg-violet-500" style={{ height: `${total ? (item.severity.severe / total) * 100 : 0}%` }} />
                          <div className="bg-rose-500" style={{ height: `${total ? (item.severity.high / total) * 100 : 0}%` }} />
                          <div className="bg-amber-400" style={{ height: `${total ? (item.severity.medium / total) * 100 : 0}%` }} />
                          <div className="bg-emerald-500" style={{ height: `${total ? (item.severity.low / total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                    <span className={`truncate text-[11px] text-slate-500 ${showBucketLabel ? "" : "opacity-0"}`}>
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm font-medium text-slate-500">No trend data</div>
        )}
      </div>
      <div className="mt-10 flex flex-wrap gap-3 text-xs text-slate-500">
        {[
          ["bg-sky-600", "High+Severe Rate"],
          ["bg-violet-500", "Severe"],
          ["bg-rose-500", "High"],
          ["bg-amber-400", "Medium"],
          ["bg-emerald-500", "Low"],
        ].map(([tone, label]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function RiskCategoryDistribution({ categories }: { categories: OverviewCategoryApi[] }) {
  const categoryData = categories.map((item, index) => ({
    label: item.category,
    value: item.count,
    percent: Math.round(item.percentage),
    ...(categoryColorMap[item.category] ?? fallbackCategoryColors[index % fallbackCategoryColors.length]),
  }));
  const total = categoryData.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;
  const pieSlices = categoryData.map((item) => {
      const start = (accumulated / total) * 100;
      accumulated += item.value;
      const end = (accumulated / total) * 100;
      const midpoint = ((start + end) / 2 / 100) * Math.PI * 2 - Math.PI / 2;
      return {
        ...item,
        gradientStop: `${item.color} ${start}% ${end}%`,
        labelX: 50 + Math.cos(midpoint) * 28,
        labelY: 50 + Math.sin(midpoint) * 28,
      };
    });
  const pieGradient = pieSlices.map((item) => item.gradientStop).join(", ");

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div>
        <h2 className="text-base font-semibold text-ink">Risk Category Distribution</h2>
        <p className="mt-1 text-xs text-slate-500">Detected event mix by risk category</p>
      </div>
      <div className="mt-5 flex flex-col items-center">
        {total ? (
          <div className="relative h-56 w-56 rounded-full" style={{ background: `conic-gradient(${pieGradient})` }}>
            {pieSlices.map((item) => (
              <div
                key={item.label}
                className="absolute max-w-24 -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.85)]"
                style={{ left: `${item.labelX}%`, top: `${item.labelY}%` }}
              >
                <span className="block">{item.label}</span>
                <span className="block">{item.percent}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-56 w-56 place-items-center rounded-full bg-slate-100 text-center text-sm font-medium text-slate-500">
            No risk category data
          </div>
        )}
        <div className="mt-7 grid w-full grid-cols-2 gap-x-4 gap-y-2">
          {categoryData.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-ink">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.tone}`} />
                <span className="truncate">{item.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TopRiskyApplications({ applications }: { applications: OverviewTopApplicationApi[] }) {
  const maxSevere = Math.max(...applications.map((item) => item.severeCount), 1);

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div>
        <h2 className="text-base font-semibold text-ink">Top Risky Applications</h2>
        <p className="mt-1 text-xs text-slate-500">Ranked by severe event count, then average risk score</p>
      </div>
      <div className="mt-4 space-y-3">
        {applications.length ? applications.map((item) => (
          <div key={item.id} className="grid grid-cols-[160px_1fr_92px] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{item.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.averageEventRiskScore} avg · {item.riskEventCount} events</p>
            </div>
            <div className="h-5 rounded-md bg-slate-100">
              <div
                className="flex h-5 items-center justify-end rounded-md bg-sky-600 pr-2 text-[10px] font-semibold text-white"
                style={{ width: `${Math.max(12, (item.severeCount / maxSevere) * 100)}%` }}
              >
                {item.severeCount}
              </div>
            </div>
            <span className="text-xs font-medium text-slate-600">{item.severeCount} severe</span>
          </div>
        )) : (
          <div className="grid h-32 place-items-center text-sm font-medium text-slate-500">No application risk data</div>
        )}
      </div>
    </section>
  );
}

export function SevereEventSnapshot({
  events,
  onOpenEvent,
}: {
  events: OverviewSevereEventApi[];
  onOpenEvent: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Severe Event Snapshot</h2>
          <p className="mt-1 text-xs text-slate-500">Top severe events requiring investigation</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {events.length ? events.map((event) => (
          <div key={event.id} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.application.name} · {event.userRef} · {new Date(event.occurredAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${levelMeta[event.level].className}`}>
                {event.score}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenEvent(event.id)}
              className="mt-3 inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              View in Risk Events
            </button>
          </div>
        )) : (
          <div className="grid h-32 place-items-center text-sm font-medium text-slate-500">No severe events</div>
        )}
      </div>
    </section>
  );
}

export function Overview({
  currentProfile,
  overviewData,
  isLoading,
  error,
  onOpenEvent,
}: {
  currentProfile: UserProfile;
  overviewData: OverviewApiData | null;
  isLoading: boolean;
  error: string | null;
  onOpenEvent: (id: string) => void;
}) {
  const summary = overviewData?.summary;
  const highSevere = (summary?.highRiskEvents ?? 0) + (summary?.severeEvents ?? 0);

  return (
    <div className="p-6">
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Model Calls Today"
          value={isLoading && !summary ? "..." : `${summary?.modelCallsToday ?? 0}`}
          delta="Model requests in the current API scope"
          icon={Activity}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Risk Events"
          value={isLoading && !summary ? "..." : `${summary?.riskEvents ?? 0}`}
          delta={`${highSevere} high and severe events`}
          icon={AlertOctagon}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          title="Blocked"
          value={isLoading && !summary ? "..." : `${summary?.blocked ?? 0}`}
          delta="Default block actions cover secrets, unauthorized access, and indirect injection"
          icon={Shield}
          tone="bg-violet-50 text-violet-700"
        />
        <StatCard
          title="Average Event Risk Score"
          value={isLoading && !summary ? "..." : `${summary?.averageEventRiskScore ?? 0}`}
          delta={`${summary?.severeEvents ?? 0} severe events awaiting review`}
          icon={Gauge}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      <section className="mt-5 grid grid-cols-[1.45fr_0.9fr] gap-5">
        <RiskLevelTrendChart profile={currentProfile} />
        <RiskCategoryDistribution categories={overviewData?.categories ?? []} />
      </section>

      <section className="mt-5 grid grid-cols-[1.1fr_0.9fr] gap-5">
        <TopRiskyApplications applications={overviewData?.topApplications ?? []} />
        <SevereEventSnapshot events={overviewData?.severeEvents ?? []} onOpenEvent={onOpenEvent} />
      </section>
    </div>
  );
}
