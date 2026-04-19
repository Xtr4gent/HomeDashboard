import { prisma } from "@/lib/prisma";
import { buildVarianceSummary, type VarianceSummary } from "@/lib/variance";

export type UpgradeProjectRow = {
  id: string;
  title: string;
  category: string;
  notes: string | null;
  status: "planned" | "in_progress" | "completed" | "archived";
  startMonthKey: string;
  targetMonthKey: string;
  monthPlannedCents: number;
  monthActualCents: number | null;
  monthVarianceCents: number | null;
  plannedTotalCents: number;
  actualTotalCents: number;
};

export type UpgradePlannerData = {
  monthKey: string;
  projects: UpgradeProjectRow[];
  monthSummary: VarianceSummary;
  totalSummary: VarianceSummary;
};

export function normalizeUpgradeCategory(rawCategory: string): string {
  return rawCategory.trim().toLowerCase();
}

export function normalizeUpgradeTitle(rawTitle: string): string {
  return rawTitle.trim();
}

export async function recalculateUpgradeProjectTotals(projectId: string): Promise<void> {
  const [plannedAggregate, actualAggregate] = await Promise.all([
    prisma.upgradePlanMonth.aggregate({
      where: { projectId },
      _sum: { plannedCents: true },
    }),
    prisma.upgradeActualMonth.aggregate({
      where: { projectId },
      _sum: { actualCents: true },
    }),
  ]);

  await prisma.upgradeProject.update({
    where: { id: projectId },
    data: {
      plannedTotalCents: plannedAggregate._sum.plannedCents ?? 0,
      actualTotalCents: actualAggregate._sum.actualCents ?? 0,
    },
  });
}

export async function getUpgradePlannerData(monthKey: string): Promise<UpgradePlannerData> {
  const projects = await prisma.upgradeProject.findMany({
    orderBy: [{ targetMonthKey: "asc" }, { title: "asc" }],
    include: {
      planMonths: true,
      actualMonths: true,
    },
  });

  const rows: UpgradeProjectRow[] = projects.map((project) => {
    const monthPlanned = project.planMonths.find((entry) => entry.monthKey === monthKey)?.plannedCents ?? 0;
    const monthActual = project.actualMonths.find((entry) => entry.monthKey === monthKey)?.actualCents ?? null;
    return {
      id: project.id,
      title: project.title,
      category: project.category,
      notes: project.notes,
      status: project.status,
      startMonthKey: project.startMonthKey,
      targetMonthKey: project.targetMonthKey,
      monthPlannedCents: monthPlanned,
      monthActualCents: monthActual,
      monthVarianceCents: monthActual === null ? null : monthActual - monthPlanned,
      plannedTotalCents: project.plannedTotalCents,
      actualTotalCents: project.actualTotalCents,
    };
  });

  const monthSummary = buildVarianceSummary(
    rows.map((row) => ({
      plannedCents: row.monthPlannedCents,
      actualCents: row.monthActualCents,
    })),
  );

  const totalSummary = buildVarianceSummary(
    rows.map((row) => ({
      plannedCents: row.plannedTotalCents,
      actualCents: row.actualTotalCents,
    })),
  );

  return {
    monthKey,
    projects: rows,
    monthSummary,
    totalSummary,
  };
}
