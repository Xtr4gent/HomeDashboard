"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/user-auth";
import { clearSession, createSession, getSession } from "@/lib/auth/session";
import { buildScenarioProjectionItems } from "@/lib/planner-builder";
import { toCents } from "@/lib/money";
import {
  aggregateScenarioTotals,
  projectFinancedItem,
} from "@/lib/planner-math";
import { plannerInputSchema } from "@/lib/planner-schema";
import { prisma } from "@/lib/prisma";
import { buildMonthlyRecurrenceRule, monthKeyFromDate } from "@/lib/time";

const addBillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.string().min(1),
  recurrenceRule: z.string().optional(),
  recurrenceMode: z.enum(["monthly_day", "monthly_last_day"]).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
});

const addUpgradeSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  cost: z.string().min(1),
});

const paymentSchema = z.object({
  billId: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  let user: { id: string; username: string } | null = null;
  try {
    user = await authenticateUser(username, password);
  } catch {
    redirect("/login?error=auth_unavailable");
  }

  if (!user) {
    redirect("/login?error=invalid_credentials");
  }

  await createSession({ userId: user.id, username: user.username });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function addBillAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = addBillSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    recurrenceRule: String(formData.get("recurrenceRule") ?? "").trim() || undefined,
    recurrenceMode: String(formData.get("recurrenceMode") ?? "").trim() || undefined,
    dueDay: String(formData.get("dueDay") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    redirect("/?error=invalid_bill_input");
  }

  let recurrenceRule = parsed.data.recurrenceRule?.trim();
  if (!recurrenceRule) {
    if (!parsed.data.recurrenceMode) {
      redirect("/?error=invalid_bill_input");
    }
    try {
      recurrenceRule = buildMonthlyRecurrenceRule(parsed.data.recurrenceMode, parsed.data.dueDay);
    } catch {
      redirect("/?error=invalid_bill_input");
    }
  }

  await prisma.bill.create({
    data: {
      name: parsed.data.name.trim(),
      category: parsed.data.category.trim(),
      amountCents: toCents(parsed.data.amount),
      recurrenceRule,
    },
  });

  revalidatePath("/");
}

export async function markPaidAction(formData: FormData): Promise<void> {
  await requireSession();

  const parsed = paymentSchema.safeParse({
    billId: String(formData.get("billId") ?? ""),
  });

  if (!parsed.success) {
    redirect("/?error=invalid_payment_input");
  }

  const bill = await prisma.bill.findUnique({
    where: { id: parsed.data.billId },
    select: { id: true, amountCents: true },
  });

  if (!bill) {
    redirect("/?error=bill_not_found");
  }

  const now = new Date();
  const monthKey = monthKeyFromDate(now);
  const paymentEventKey = `${monthKey}:${bill.id}`;

  try {
    await prisma.payment.create({
      data: {
        billId: bill.id,
        amountCents: bill.amountCents,
        paidAt: now,
        paymentEventKey,
      },
    });
  } catch {
    // Duplicate click or replay for same month should be a no-op.
  }

  revalidatePath("/");
}

export async function addUpgradeAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = addUpgradeSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    cost: String(formData.get("cost") ?? ""),
  });

  if (!parsed.success) {
    redirect("/?error=invalid_upgrade_input");
  }

  await prisma.upgrade.create({
    data: {
      title: parsed.data.title.trim(),
      category: parsed.data.category.trim(),
      costCents: toCents(parsed.data.cost),
      loggedAt: new Date(),
    },
  });

  revalidatePath("/");
}

export async function saveScenarioAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = plannerInputSchema.safeParse({
    scenarioId: String(formData.get("scenarioId") ?? "").trim() || undefined,
    expectedVersion: String(formData.get("expectedVersion") ?? "").trim() || undefined,
    name: String(formData.get("name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    mortgagePrincipal: String(formData.get("mortgagePrincipal") ?? ""),
    mortgageRateAnnualPct: String(formData.get("mortgageRateAnnualPct") ?? ""),
    mortgageTermMonths: String(formData.get("mortgageTermMonths") ?? ""),
    propertyTaxMonthly: String(formData.get("propertyTaxMonthly") ?? ""),
    insuranceMonthly: String(formData.get("insuranceMonthly") ?? ""),
    utilitiesMonthly: String(formData.get("utilitiesMonthly") ?? ""),
    otherMonthly: String(formData.get("otherMonthly") ?? ""),
    upgradeOneTimeCost: String(formData.get("upgradeOneTimeCost") ?? ""),
    upgradeSpreadMonths: String(formData.get("upgradeSpreadMonths") ?? ""),
    upgradeRateAnnualPct: String(formData.get("upgradeRateAnnualPct") ?? ""),
    compare: String(formData.get("compare") ?? ""),
  });

  if (!parsed.success) {
    redirect("/planner?error=invalid_scenario_input");
  }

  const projectionItems = buildScenarioProjectionItems(parsed.data);
  const totals = aggregateScenarioTotals(projectionItems);
  const defaultRecurrenceRule = buildMonthlyRecurrenceRule("monthly_day", new Date().getDate());

  await prisma.$transaction(async (tx) => {
    let scenarioId = parsed.data.scenarioId;

    if (scenarioId) {
      const existing = await tx.scenario.findUnique({
        where: { id: scenarioId },
        select: { id: true, status: true, version: true },
      });

      if (!existing || existing.status === "applied") {
        throw new Error("Cannot edit a missing or already-applied scenario.");
      }
      if (parsed.data.expectedVersion && parsed.data.expectedVersion !== existing.version) {
        throw new Error("Scenario version conflict.");
      }

      await tx.scenario.update({
        where: { id: scenarioId },
        data: {
          name: parsed.data.name,
          notes: parsed.data.notes || null,
          version: { increment: 1 },
          monthlyTotalCents: totals.monthlyTotalCents,
          yearlyTotalCents: totals.yearlyTotalCents,
          financedMonthlyCents: totals.financedMonthlyCents,
          recurringMonthlyCents: totals.recurringMonthlyCents,
          oneTimeCents: totals.oneTimeCents,
        },
      });

      await tx.scenarioItem.deleteMany({ where: { scenarioId } });
    } else {
      const created = await tx.scenario.create({
        data: {
          name: parsed.data.name,
          notes: parsed.data.notes || null,
          monthlyTotalCents: totals.monthlyTotalCents,
          yearlyTotalCents: totals.yearlyTotalCents,
          financedMonthlyCents: totals.financedMonthlyCents,
          recurringMonthlyCents: totals.recurringMonthlyCents,
          oneTimeCents: totals.oneTimeCents,
        },
        select: { id: true },
      });
      scenarioId = created.id;
    }

    const plannerItems = projectionItems.map((item) => {
      if (item.kind === "recurring") {
        return {
          scenarioId,
          label: item.label,
          category: item.category,
          itemType: "recurring" as const,
          amountCents: item.monthlyCents,
          recurrenceRule: defaultRecurrenceRule,
          termMonths: null,
          annualRateBps: null,
          sourceKind: null,
        };
      }
      if (item.kind === "financed") {
        return {
          scenarioId,
          label: item.label,
          category: item.category,
          itemType: "financed" as const,
          amountCents: item.principalCents,
          recurrenceRule: defaultRecurrenceRule,
          termMonths: item.termMonths,
          annualRateBps: item.annualRateBps,
          sourceKind: item.category === "upgrade" ? "upgrade" : "housing",
        };
      }
      return {
        scenarioId,
        label: item.label,
        category: item.category,
        itemType: "one_time" as const,
        amountCents: item.oneTimeCents,
        recurrenceRule: null,
        termMonths: null,
        annualRateBps: null,
        sourceKind: "upgrade",
      };
    });

    await tx.scenarioItem.createMany({ data: plannerItems });
  }).catch(() => {
    redirect("/planner?error=scenario_save_failed");
  });

  revalidatePath("/planner");
  revalidatePath("/");
  redirect("/planner?success=scenario_saved");
}

export async function applyScenarioAction(formData: FormData): Promise<void> {
  await requireSession();
  const scenarioId = String(formData.get("scenarioId") ?? "").trim();
  const expectedVersion = Number(String(formData.get("expectedVersion") ?? "").trim());

  if (!scenarioId || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    redirect("/planner?error=invalid_apply_request");
  }

  await prisma.$transaction(async (tx) => {
    const scenario = await tx.scenario.findUnique({
      where: { id: scenarioId },
      include: { items: true },
    });

    if (!scenario) {
      throw new Error("Scenario not found.");
    }
    if (scenario.status === "applied") {
      return;
    }
    if (scenario.version !== expectedVersion) {
      throw new Error("Stale scenario version.");
    }

    const fallbackRecurrenceRule = buildMonthlyRecurrenceRule("monthly_day", new Date().getDate());

    for (const item of scenario.items) {
      if (item.itemType === "recurring") {
        await tx.bill.create({
          data: {
            name: item.label,
            category: item.category,
            amountCents: item.amountCents,
            recurrenceRule: item.recurrenceRule ?? fallbackRecurrenceRule,
          },
        });
        continue;
      }

      if (item.itemType === "financed") {
        const financed = projectFinancedItem({
          principalCents: item.amountCents,
          annualRateBps: item.annualRateBps ?? 0,
          termMonths: item.termMonths ?? 1,
        });

        await tx.bill.create({
          data: {
            name: `${item.label} (financed)`,
            category: item.category,
            amountCents: financed.monthlyCents,
            recurrenceRule: item.recurrenceRule ?? fallbackRecurrenceRule,
          },
        });

        if (item.sourceKind === "upgrade") {
          await tx.upgrade.create({
            data: {
              title: item.label,
              category: "financed-upgrade",
              costCents: item.amountCents,
              loggedAt: new Date(),
            },
          });
        }
        continue;
      }

      await tx.upgrade.create({
        data: {
          title: item.label,
          category: item.category,
          costCents: item.amountCents,
          loggedAt: new Date(),
        },
      });
    }

    await tx.scenario.update({
      where: { id: scenario.id },
      data: {
        status: "applied",
        appliedAt: new Date(),
      },
    });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Stale scenario")) {
      redirect("/planner?error=stale_scenario");
    }
    redirect("/planner?error=scenario_apply_failed");
  });

  revalidatePath("/planner");
  revalidatePath("/");
  redirect("/planner?success=scenario_applied");
}
