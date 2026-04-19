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
  monthClose: {
    monthKey: string;
    status: "locked" | "reopened";
    closedByUsername: string;
    closedAt: Date;
    reopenedAt: Date | null;
  } | null;
  cashflowForecastWeeks: {
    label: string;
    startDate: string;
    endDate: string;
    totalCents: number;
    dueCount: number;
    isRisk: boolean;
  }[];
  anomalyAlerts: {
    id: string;
    title: string;
    detail: string;
    severity: "moderate" | "high";
    monthKey: string;
  }[];
  recentActivity: {
    id: string;
    action: string;
    actorUsername: string;
    summary: string;
    createdAt: Date;
    monthKey: string | null;
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function buildCashflowForecastWeeks(args: {
  bills: { name: string; amountCents: number; recurrenceRule: string }[];
  now: Date;
  horizonDays?: number;
}): DashboardData["cashflowForecastWeeks"] {
  const horizonDays = args.horizonDays ?? 56;
  const startDate = dateStringInTimezone(args.now);
  const endDate = dateStringInTimezone(addDays(args.now, horizonDays));
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const monthCandidates = [
    [startYear, startMonth],
    [startMonth === 12 ? startYear + 1 : startYear, startMonth === 12 ? 1 : startMonth + 1],
    [startMonth >= 11 ? startYear + 1 : startYear, ((startMonth + 1) % 12) + 1],
  ] as const;

  const eventDates: { date: string; amountCents: number }[] = [];
  for (const [year, month] of monthCandidates) {
    for (const bill of args.bills) {
      for (const dueDate of dueDatesForMonth(bill.recurrenceRule, year, month)) {
        if (dueDate >= startDate && dueDate <= endDate) {
          eventDates.push({ date: dueDate, amountCents: bill.amountCents });
        }
      }
    }
  }

  const weeks: DashboardData["cashflowForecastWeeks"] = [];
  for (let weekIndex = 0; weekIndex < Math.ceil(horizonDays / 7); weekIndex += 1) {
    const start = dateStringInTimezone(addDays(args.now, weekIndex * 7));
    const end = dateStringInTimezone(addDays(args.now, weekIndex * 7 + 6));
    const inWeek = eventDates.filter((event) => event.date >= start && event.date <= end);
    weeks.push({
      label: `W${weekIndex + 1}`,
      startDate: start,
      endDate: end,
      totalCents: inWeek.reduce((sum, event) => sum + event.amountCents, 0),
      dueCount: inWeek.length,
      isRisk: false,
    });
  }

  const average = weeks.length === 0 ? 0 : weeks.reduce((sum, week) => sum + week.totalCents, 0) / weeks.length;
  return weeks.map((week) => ({
    ...week,
    isRisk: week.totalCents > average * 1.35 && week.totalCents > 0,
  }));
}

function buildAnomalyAlerts(args: {
  monthKey: string;
  utilityProjectionRows: { category: string; plannedCents: number; actualCents: number | null }[];
  cashflowThisMonthCostCents: number;
  totalMonthlyCostCents: number;
}): DashboardData["anomalyAlerts"] {
  const alerts: DashboardData["anomalyAlerts"] = [];
  for (const row of args.utilityProjectionRows) {
    if (row.actualCents === null || row.plannedCents <= 0) {
      continue;
    }
    const varianceCents = row.actualCents - row.plannedCents;
    const variancePct = Math.abs(varianceCents) / row.plannedCents;
    if (Math.abs(varianceCents) >= 2_000 && variancePct >= 0.2) {
      alerts.push({
        id: `utility:${row.category}`,
        monthKey: args.monthKey,
        severity: variancePct >= 0.35 ? "high" : "moderate",
        title: `${row.category} drifted from plan`,
        detail: `Planned vs actual differs by ${Math.round(variancePct * 100)}%.`,
      });
    }
  }

  if (args.cashflowThisMonthCostCents > args.totalMonthlyCostCents * 1.2) {
    alerts.push({
      id: "cashflow-over-prorated",
      monthKey: args.monthKey,
      severity: "moderate",
      title: "Cashflow concentration risk this month",
      detail: "Due-this-month cashflow is materially above your prorated run-rate.",
    });
  }

  return alerts.slice(0, 6);
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
  const [utilityProjections, plannedUpgradeMonths, actualUpgradeMonths, monthClose, recentActivity] = await Promise.all([
    prisma.utilityProjection.findMany({
      where: { monthKey },
      select: { category: true, plannedCents: true, actualCents: true },
    }),
    prisma.upgradePlanMonth.findMany({
      where: { monthKey },
      select: { projectId: true, plannedCents: true },
    }),
    prisma.upgradeActualMonth.findMany({
      where: { monthKey },
      select: { projectId: true, actualCents: true },
    }),
    prisma.monthClose.findUnique({
      where: { monthKey },
      select: {
        monthKey: true,
        status: true,
        closedByUsername: true,
        closedAt: true,
        reopenedAt: true,
      },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        actorUsername: true,
        summary: true,
        createdAt: true,
        monthKey: true,
      },
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

  const cashflowForecastWeeks = buildCashflowForecastWeeks({
    bills,
    now,
  });
  const anomalyAlerts = buildAnomalyAlerts({
    monthKey,
    utilityProjectionRows: utilityProjections,
    cashflowThisMonthCostCents,
    totalMonthlyCostCents,
  });

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
    monthClose,
    cashflowForecastWeeks,
    anomalyAlerts,
    recentActivity,
  };
}
