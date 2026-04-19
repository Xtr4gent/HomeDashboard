import { prisma } from "@/lib/prisma";
import { monthKeyFromDate } from "@/lib/time";
import { buildVarianceSummary } from "@/lib/variance";

export type UtilityProjectionRow = {
  id: string;
  category: string;
  plannedCents: number;
  actualCents: number | null;
  varianceCents: number | null;
};

export type UtilityProjectionSummary = {
  plannedTotalCents: number;
  actualTotalCents: number;
  varianceTotalCents: number;
  actualCoverageCount: number;
};

export type UtilityProjectionData = {
  monthKey: string;
  rows: UtilityProjectionRow[];
  summary: UtilityProjectionSummary;
  outliers: {
    largestOverrun: UtilityProjectionRow | null;
    largestUnderrun: UtilityProjectionRow | null;
  };
};

export function resolveProjectionMonthKey(rawMonthKey: string | undefined, now = new Date()): string {
  const candidate = (rawMonthKey ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(candidate)) {
    const [, monthText] = candidate.split("-");
    const month = Number(monthText);
    if (month >= 1 && month <= 12) {
      return candidate;
    }
  }

  return monthKeyFromDate(now);
}

export function normalizeProjectionCategory(rawCategory: string): string {
  return rawCategory.trim().toLowerCase();
}

export function buildProjectionSummary(rows: Array<{ plannedCents: number; actualCents: number | null }>): UtilityProjectionSummary {
  const summary = buildVarianceSummary(rows);
  return {
    plannedTotalCents: summary.plannedTotalCents,
    actualTotalCents: summary.actualTotalCents,
    varianceTotalCents: summary.varianceTotalCents,
    actualCoverageCount: summary.actualCoverageCount,
  };
}

export const DEFAULT_UTILITY_PROJECTION_CATEGORIES = ["hydro", "gas", "water", "internet"];

export function buildProjectionOutliers(rows: UtilityProjectionRow[]): UtilityProjectionData["outliers"] {
  const withVariance = rows.filter((row) => row.varianceCents !== null);
  if (withVariance.length === 0) {
    return {
      largestOverrun: null,
      largestUnderrun: null,
    };
  }

  const largestOverrun = [...withVariance]
    .filter((row) => (row.varianceCents ?? 0) > 0)
    .sort((a, b) => (b.varianceCents ?? 0) - (a.varianceCents ?? 0))[0] ?? null;
  const largestUnderrun = [...withVariance]
    .filter((row) => (row.varianceCents ?? 0) < 0)
    .sort((a, b) => (a.varianceCents ?? 0) - (b.varianceCents ?? 0))[0] ?? null;

  return {
    largestOverrun,
    largestUnderrun,
  };
}

export async function getUtilityProjectionData(monthKey: string): Promise<UtilityProjectionData> {
  const projections = await prisma.utilityProjection.findMany({
    where: { monthKey },
    orderBy: { category: "asc" },
  });

  const rows: UtilityProjectionRow[] = projections.map((projection) => ({
    id: projection.id,
    category: projection.category,
    plannedCents: projection.plannedCents,
    actualCents: projection.actualCents,
    varianceCents: projection.actualCents === null ? null : projection.actualCents - projection.plannedCents,
  }));

  return {
    monthKey,
    rows,
    summary: buildProjectionSummary(rows),
    outliers: buildProjectionOutliers(rows),
  };
}
