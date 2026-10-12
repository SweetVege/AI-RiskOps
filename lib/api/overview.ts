export const severityLevels = ["low", "medium", "high", "severe"] as const;

export type SeverityLevel = (typeof severityLevels)[number];
export type TrendPeriod = "daily" | "monthly" | "quarterly";

export function normalizeTrendPeriod(value: string | null): TrendPeriod {
  if (value === "monthly" || value === "quarterly") {
    return value;
  }

  return "daily";
}

export function percentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function averageOf(total: number, count: number) {
  return count === 0 ? 0 : Math.round((total / count) * 10) / 10;
}

export function trendBucket(date: Date, period: TrendPeriod) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (period === "monthly") {
    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    };
  }

  if (period === "quarterly") {
    const quarter = Math.floor(month / 3) + 1;

    return {
      key: `${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
    };
  }

  return {
    key: date.toISOString().slice(0, 10),
    label: date.toLocaleString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }),
  };
}

export function emptySeverityCounts() {
  return {
    low: 0,
    medium: 0,
    high: 0,
    severe: 0,
  };
}

export function severityRank(level: string) {
  return {
    severe: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[level] ?? 0;
}

