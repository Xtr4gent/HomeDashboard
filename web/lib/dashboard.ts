import { prisma } from "@/lib/prisma";
import {
  dateDiffInDays,
  dateStringInTimezone,
  dueDatesForMonth,
  monthKeyFromDate,
  parseRecurrenceRule,
} from "@/lib/time";
import { buildVarianceSummary } from "@/lib/variance";

const UTILITY_CATEGORIES = new Set(["utility", "water", "hydro", "gas", "internet"]);

export type BillStatus =
  | "paid_this_month"
  | "overdue"
  | "due_soon"
  | "unpaid_this_month"
  | "not_due_this_month";

export type DashboardBill = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  dueDate: string | null;
  status: BillStatus;
  isPaid: boolean;
  monthlyEquivalentCents: number;
  cashflowThisMonthCents: number;
};

export type DashboardData = {
  monthKey: string;
  todayDate: string;
  bills: DashboardBill[];
  utilitiesTotalCents: number;
  upgradesTotalCents: number;
  totalMonthlyCostCents: number;
  cashflowThisMonthCostCents: number;
  projectedYearlyCostCents: number;
  overdueCount: number;
  dueSoonCount: number;
  unpaidCount: number;
  paidCount: number;
  paidRatePct: number;
  categoryTotals: {
    category: string;
    totalCents: number;
  }[];
  utilityProjection: {
    plannedCents: number;
    actualCents: number;
    varianceCents: number;
    coverageCount: number;
  };
  upgradeProjection: {
    plannedCents: number;
    actualCents: number;
    varianceCents: number;
    coverageCount: number;
  };
  upgrades: {
    id: string;
    title: string;
    category: string;
    costCents: number;
    loggedAt: Date;
  }[];
};

function getStatus(args: { dueDate: string; todayDate: string; isPaid: boolean }): BillStatus {
  const { dueDate, todayDate, isPaid } = args;
  if (isPaid) {
    return "paid_this_month";
  }

  if (dueDate < todayDate) {
    return "overdue";
  }

  if (dateDiffInDays(todayDate, dueDate) <= 7) {
    return "due_soon";
  }

  return "unpaid_this_month";
}

function monthlyEquivalentForBill(amountCents: number, recurrenceRule: string): number {
  const parsed = parseRecurrenceRule(recurrenceRule);
  if (parsed.kind === "semi_monthly") {
    return amountCents * 2;
  }
  if (parsed.kind === "yearly") {
    return Math.round(amountCents / 12);
  }
  return amountCents;
}

function cashflowForMonth(amountCents: number, recurrenceRule: string, dueDatesThisMonth: string[]): number {
  const parsed = parseRecurrenceRule(recurrenceRule);
  if (parsed.kind === "semi_monthly") {
    return dueDatesThisMonth.length * amountCents;
  }
  if (parsed.kind === "yearly") {
    return dueDatesThisMonth.length > 0 ? amountCents : 0;
  }
  return amountCents;
}

export function projectedYearlyCost(totalMonthlyCostCents: number): number {
  return totalMonthlyCostCents * 12;
}

export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const monthKey = monthKeyFromDate(now);
  const todayDate = dateStringInTimezone(now);
  const [year, month] = monthKey.split("-").map(Number);

  const bills = await prisma.bill.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      payments: {
        where: { paymentEventKey: { startsWith: `${monthKey}:` } },
        select: { id: true },
      },
    },
  });

  const upgrades: DashboardData["upgrades"] = await prisma.upgrade.findMany({
    where: {
      loggedAt: {
        gte: new Date(`${monthKey}-01T00:00:00.000Z`),
        lt: new Date(
          `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01T00:00:00.000Z`,
        ),
      },
    },
    orderBy: { loggedAt: "desc" },
  });
  const [utilityProjections, plannedUpgradeMonths, actualUpgradeMonths] = await Promise.all([
    prisma.utilityProjection.findMany({
      where: { monthKey },
      select: { plannedCents: true, actualCents: true },
    }),
    prisma.upgradePlanMonth.findMany({
      where: { monthKey },
      select: { projectId: true, plannedCents: true },
    }),
    prisma.upgradeActualMonth.findMany({
      where: { monthKey },
      select: { projectId: true, actualCents: true },
    }),
  ]);

  const mappedBills: DashboardBill[] = bills.map((bill: (typeof bills)[number]) => {
    const dueDatesThisMonth = dueDatesForMonth(bill.recurrenceRule, year, month);
    const nextDueDate = dueDatesThisMonth.find((dueDate) => dueDate >= todayDate) ?? dueDatesThisMonth[0] ?? null;
    const isPaid = bill.payments.length > 0;
    const monthlyEquivalentCents = monthlyEquivalentForBill(bill.amountCents, bill.recurrenceRule);
    const cashflowThisMonthCents = cashflowForMonth(bill.amountCents, bill.recurrenceRule, dueDatesThisMonth);
    const status = dueDatesThisMonth.length === 0
      ? "not_due_this_month"
      : getStatus({ dueDate: nextDueDate ?? todayDate, todayDate, isPaid });

    return {
      id: bill.id,
      name: bill.name,
      category: bill.category,
      amountCents: bill.amountCents,
      dueDate: nextDueDate,
      isPaid,
      status,
      monthlyEquivalentCents,
      cashflowThisMonthCents,
    };
  });

  const utilitiesTotalCents = mappedBills
    .filter((bill) => UTILITY_CATEGORIES.has(bill.category.toLowerCase()))
    .reduce((sum, bill) => sum + bill.monthlyEquivalentCents, 0);
  const upgradesTotalCents = upgrades.reduce((sum, upgrade) => sum + upgrade.costCents, 0);
  const totalMonthlyCostCents =
    mappedBills.reduce((sum, bill) => sum + bill.monthlyEquivalentCents, 0) + upgradesTotalCents;
  const cashflowThisMonthCostCents =
    mappedBills.reduce((sum, bill) => sum + bill.cashflowThisMonthCents, 0) + upgradesTotalCents;
  const categoryMap = new Map<string, number>();
  for (const bill of mappedBills) {
    const key = bill.category.toLowerCase();
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + bill.monthlyEquivalentCents);
  }
  const categoryTotals = [...categoryMap.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 5);
  const dueThisMonthBills = mappedBills.filter((bill) => bill.status !== "not_due_this_month");
  const paidCount = dueThisMonthBills.filter((bill) => bill.status === "paid_this_month").length;
  const paidRatePct = dueThisMonthBills.length === 0 ? 0 : Math.round((paidCount / dueThisMonthBills.length) * 100);
  const utilityProjectionSummary = buildVarianceSummary(utilityProjections);
  const actualByProject = new Map(actualUpgradeMonths.map((row) => [row.projectId, row.actualCents]));
  const upgradeProjectionSummary = buildVarianceSummary(
    plannedUpgradeMonths.map((row) => ({
      plannedCents: row.plannedCents,
      actualCents: actualByProject.get(row.projectId) ?? null,
    })),
  );

  return {
    monthKey,
    todayDate,
    bills: mappedBills,
    utilitiesTotalCents,
    upgradesTotalCents,
    totalMonthlyCostCents,
    cashflowThisMonthCostCents,
    projectedYearlyCostCents: projectedYearlyCost(totalMonthlyCostCents),
    overdueCount: mappedBills.filter((bill) => bill.status === "overdue").length,
    dueSoonCount: mappedBills.filter((bill) => bill.status === "due_soon").length,
    unpaidCount: mappedBills.filter((bill) => bill.status === "unpaid_this_month").length,
    paidCount,
    paidRatePct,
    categoryTotals,
    utilityProjection: {
      plannedCents: utilityProjectionSummary.plannedTotalCents,
      actualCents: utilityProjectionSummary.actualTotalCents,
      varianceCents: utilityProjectionSummary.varianceTotalCents,
      coverageCount: utilityProjectionSummary.actualCoverageCount,
    },
    upgradeProjection: {
      plannedCents: upgradeProjectionSummary.plannedTotalCents,
      actualCents: upgradeProjectionSummary.actualTotalCents,
      varianceCents: upgradeProjectionSummary.varianceTotalCents,
      coverageCount: upgradeProjectionSummary.actualCoverageCount,
    },
    upgrades,
  };
}
