import { prisma } from "@/lib/prisma";
import { monthKeyFromDate } from "@/lib/time";

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
  const plannedTotalCents = rows.reduce((sum, row) => sum + row.plannedCents, 0);
  const actualRows = rows.filter((row) => row.actualCents !== null);
  const actualTotalCents = actualRows.reduce((sum, row) => sum + (row.actualCents ?? 0), 0);

  return {
    plannedTotalCents,
    actualTotalCents,
    varianceTotalCents: actualTotalCents - plannedTotalCents,
    actualCoverageCount: actualRows.length,
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
  };
}
