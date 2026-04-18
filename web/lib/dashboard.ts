import { prisma } from "@/lib/prisma";
import {
  dateDiffInDays,
  dateStringInTimezone,
  dueDateForMonth,
  monthKeyFromDate,
} from "@/lib/time";

export type BillStatus = "paid_this_month" | "overdue" | "due_soon" | "unpaid_this_month";

export type DashboardBill = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  dueDate: string;
  status: BillStatus;
  isPaid: boolean;
};

export type DashboardData = {
  monthKey: string;
  todayDate: string;
  bills: DashboardBill[];
  utilitiesTotalCents: number;
  upgradesTotalCents: number;
  totalMonthlyCostCents: number;
  overdueCount: number;
  dueSoonCount: number;
  unpaidCount: number;
  paidCount: number;
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

  const upgrades = await prisma.upgrade.findMany({
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

  const mappedBills = bills.map((bill) => {
    const dueDate = dueDateForMonth(bill.recurrenceRule, year, month);
    const isPaid = bill.payments.length > 0;
    return {
      id: bill.id,
      name: bill.name,
      category: bill.category,
      amountCents: bill.amountCents,
      dueDate,
      isPaid,
      status: getStatus({ dueDate, todayDate, isPaid }),
    };
  });

  const utilitiesTotalCents = mappedBills
    .filter((bill) => bill.category.toLowerCase() === "utility")
    .reduce((sum, bill) => sum + bill.amountCents, 0);
  const upgradesTotalCents = upgrades.reduce((sum, upgrade) => sum + upgrade.costCents, 0);
  const totalMonthlyCostCents =
    mappedBills.reduce((sum, bill) => sum + bill.amountCents, 0) + upgradesTotalCents;

  return {
    monthKey,
    todayDate,
    bills: mappedBills,
    utilitiesTotalCents,
    upgradesTotalCents,
    totalMonthlyCostCents,
    overdueCount: mappedBills.filter((bill) => bill.status === "overdue").length,
    dueSoonCount: mappedBills.filter((bill) => bill.status === "due_soon").length,
    unpaidCount: mappedBills.filter((bill) => bill.status === "unpaid_this_month").length,
    paidCount: mappedBills.filter((bill) => bill.status === "paid_this_month").length,
    upgrades,
  };
}
