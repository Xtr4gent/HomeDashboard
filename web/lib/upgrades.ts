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
  isOverdueTarget: boolean;
};

export type UpgradePlannerData = {
  monthKey: string;
  projects: UpgradeProjectRow[];
  activeCount: number;
  overdueCount: number;
  completedCount: number;
  monthSummary: VarianceSummary;
  totalSummary: VarianceSummary;
};

export function normalizeUpgradeCategory(rawCategory: string): string {
  return rawCategory.trim().toLowerCase();
}

export function normalizeUpgradeTitle(rawTitle: string): string {
  return rawTitle.trim();
}

export function filterUpgradeProjects(
  projects: UpgradeProjectRow[],
  view: "all" | "active" | "overdue" | "completed",
): UpgradeProjectRow[] {
  if (view === "active") {
    return projects.filter((project) => project.status === "planned" || project.status === "in_progress");
  }
  if (view === "overdue") {
    return projects.filter((project) => project.isOverdueTarget);
  }
  if (view === "completed") {
    return projects.filter((project) => project.status === "completed");
  }
  return projects;
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
      isOverdueTarget:
        project.targetMonthKey < monthKey && project.status !== "completed" && project.status !== "archived",
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
    activeCount: rows.filter((row) => row.status === "planned" || row.status === "in_progress").length,
    overdueCount: rows.filter((row) => row.isOverdueTarget).length,
    completedCount: rows.filter((row) => row.status === "completed").length,
    monthSummary,
    totalSummary,
  };
}
