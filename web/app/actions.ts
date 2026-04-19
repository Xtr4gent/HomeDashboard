"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/user-auth";
import { enqueueAnalyticsRecompute, processQueuedAnalyticsJobs } from "@/lib/analytics";
import { clearSession, createSession, getSession } from "@/lib/auth/session";
import { getClock } from "@/lib/clock";
import { buildScenarioProjectionItems } from "@/lib/planner-builder";
import { toCents } from "@/lib/money";
import {
  aggregateScenarioTotals,
  projectFinancedItem,
} from "@/lib/planner-math";
import { plannerInputSchema } from "@/lib/planner-schema";
import { normalizeProjectionCategory, resolveProjectionMonthKey, DEFAULT_UTILITY_PROJECTION_CATEGORIES } from "@/lib/projections";
import { prisma } from "@/lib/prisma";
import { buildRecurrenceRule, monthKeyFromDate } from "@/lib/time";
import { normalizeUpgradeCategory, normalizeUpgradeTitle, recalculateUpgradeProjectTotals } from "@/lib/upgrades";

const addBillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.string().min(1),
  recurrenceRule: z.string().optional(),
  recurrenceMode: z.enum(["monthly_day", "monthly_last_day", "semi_monthly", "yearly"]).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  secondDueDay: z.coerce.number().int().min(1).max(31).optional(),
  dueMonth: z.coerce.number().int().min(1).max(12).optional(),
});

const addUpgradeSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  cost: z.string().min(1),
});

const paymentSchema = z.object({
  billId: z.string().min(1),
});

const saveProjectionSchema = z.object({
  monthKey: z.string().min(1),
  category: z.string().min(1),
  planned: z.string().min(1),
  actual: z.string().optional(),
});

const deleteProjectionSchema = z.object({
  projectionId: z.string().min(1),
});

const seedProjectionDefaultsSchema = z.object({
  monthKey: z.string().min(1),
});

const saveUpgradeProjectSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1),
  category: z.string().min(1),
  notes: z.string().optional(),
  status: z.enum(["planned", "in_progress", "completed", "archived"]),
  startMonthKey: z.string().min(1),
  targetMonthKey: z.string().min(1),
});

const saveUpgradeMonthValueSchema = z.object({
  projectId: z.string().min(1),
  monthKey: z.string().min(1),
  amount: z.string().min(1),
});

const deleteUpgradeProjectSchema = z.object({
  projectId: z.string().min(1),
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
    secondDueDay: String(formData.get("secondDueDay") ?? "").trim() || undefined,
    dueMonth: String(formData.get("dueMonth") ?? "").trim() || undefined,
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
      recurrenceRule = buildRecurrenceRule(parsed.data.recurrenceMode, {
        dueDay: parsed.data.dueDay,
        secondDueDay: parsed.data.secondDueDay,
        dueMonth: parsed.data.dueMonth,
      });
    } catch {
      redirect("/?error=invalid_bill_input");
    }
  }

  const createdBill = await prisma.bill.create({
    data: {
      name: parsed.data.name.trim(),
      category: parsed.data.category.trim(),
      amountCents: toCents(parsed.data.amount),
      recurrenceRule,
    },
  });
  await enqueueAnalyticsRecompute({
    sourceEventKey: `bill_created:${createdBill.id}:${createdBill.updatedAt.toISOString()}`,
    triggerType: "bill_created",
  });
  void processQueuedAnalyticsJobs({ limit: 2 });

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
    const payment = await prisma.payment.create({
      data: {
        billId: bill.id,
        amountCents: bill.amountCents,
        paidAt: now,
        paymentEventKey,
      },
    });
    await enqueueAnalyticsRecompute({
      sourceEventKey: `payment_marked:${payment.paymentEventKey}`,
      triggerType: "payment_marked",
      at: payment.paidAt,
    });
    void processQueuedAnalyticsJobs({ limit: 2 });
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

  const createdUpgrade = await prisma.upgrade.create({
    data: {
      title: parsed.data.title.trim(),
      category: parsed.data.category.trim(),
      costCents: toCents(parsed.data.cost),
      loggedAt: new Date(),
    },
  });
  await enqueueAnalyticsRecompute({
    sourceEventKey: `upgrade_created:${createdUpgrade.id}:${createdUpgrade.updatedAt.toISOString()}`,
    triggerType: "upgrade_created",
    at: createdUpgrade.loggedAt,
  });
  void processQueuedAnalyticsJobs({ limit: 2 });

  revalidatePath("/");
}

export async function saveUtilityProjectionAction(formData: FormData): Promise<void> {
  await requireSession();

  const parsed = saveProjectionSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
    category: String(formData.get("category") ?? ""),
    planned: String(formData.get("planned") ?? ""),
    actual: String(formData.get("actual") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    redirect("/projections?error=invalid_projection_input");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  const category = normalizeProjectionCategory(parsed.data.category);
  if (!category) {
    redirect(`/projections?month=${encodeURIComponent(monthKey)}&error=invalid_projection_category`);
  }

  let plannedCents = 0;
  let actualCents: number | null = null;
  try {
    plannedCents = toCents(parsed.data.planned, { allowZero: true });
    actualCents = parsed.data.actual ? toCents(parsed.data.actual, { allowZero: true }) : null;
  } catch {
    redirect(`/projections?month=${encodeURIComponent(monthKey)}&error=invalid_projection_amount`);
  }

  await prisma.utilityProjection.upsert({
    where: {
      monthKey_category: {
        monthKey,
        category,
      },
    },
    create: {
      monthKey,
      category,
      plannedCents,
      actualCents,
    },
    update: {
      plannedCents,
      actualCents,
    },
  });

  revalidatePath("/projections");
}

export async function deleteUtilityProjectionAction(formData: FormData): Promise<void> {
  await requireSession();

  const parsed = deleteProjectionSchema.safeParse({
    projectionId: String(formData.get("projectionId") ?? ""),
  });

  if (!parsed.success) {
    redirect("/projections?error=invalid_projection_delete");
  }

  await prisma.utilityProjection.delete({
    where: { id: parsed.data.projectionId },
  }).catch(() => {
    // Projection may already be deleted in another tab.
  });

  revalidatePath("/projections");
}

export async function seedUtilityProjectionDefaultsAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = seedProjectionDefaultsSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/projections?error=invalid_projection_seed");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  await prisma.$transaction(async (tx) => {
    for (const category of DEFAULT_UTILITY_PROJECTION_CATEGORIES) {
      await tx.utilityProjection.upsert({
        where: {
          monthKey_category: {
            monthKey,
            category,
          },
        },
        update: {},
        create: {
          monthKey,
          category,
          plannedCents: 0,
          actualCents: null,
        },
      });
    }
  });

  revalidatePath("/projections");
}

export async function saveUpgradeProjectAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = saveUpgradeProjectSchema.safeParse({
    projectId: String(formData.get("projectId") ?? "").trim() || undefined,
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "planned"),
    startMonthKey: String(formData.get("startMonthKey") ?? ""),
    targetMonthKey: String(formData.get("targetMonthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/upgrades?error=invalid_upgrade_project");
  }

  const startMonthKey = resolveProjectionMonthKey(parsed.data.startMonthKey);
  const targetMonthKey = resolveProjectionMonthKey(parsed.data.targetMonthKey);
  const category = normalizeUpgradeCategory(parsed.data.category);
  const title = normalizeUpgradeTitle(parsed.data.title);
  if (!title || !category) {
    redirect(`/upgrades?month=${encodeURIComponent(startMonthKey)}&error=invalid_upgrade_project`);
  }

  const payload = {
    title,
    category,
    notes: parsed.data.notes ?? null,
    status: parsed.data.status,
    startMonthKey,
    targetMonthKey,
  };

  if (parsed.data.projectId) {
    await prisma.upgradeProject.update({
      where: { id: parsed.data.projectId },
      data: payload,
    }).catch(() => {
      redirect(`/upgrades?month=${encodeURIComponent(startMonthKey)}&error=invalid_upgrade_project`);
    });
  } else {
    await prisma.upgradeProject.create({
      data: payload,
    });
  }

  revalidatePath("/upgrades");
}

export async function saveUpgradePlannedMonthAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = saveUpgradeMonthValueSchema.safeParse({
    projectId: String(formData.get("projectId") ?? ""),
    monthKey: String(formData.get("monthKey") ?? ""),
    amount: String(formData.get("planned") ?? ""),
  });
  if (!parsed.success) {
    redirect("/upgrades?error=invalid_upgrade_plan_month");
  }
  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);

  let plannedCents = 0;
  try {
    plannedCents = toCents(parsed.data.amount, { allowZero: true });
  } catch {
    redirect(`/upgrades?month=${encodeURIComponent(monthKey)}&error=invalid_upgrade_plan_month`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.upgradePlanMonth.upsert({
      where: {
        projectId_monthKey: {
          projectId: parsed.data.projectId,
          monthKey,
        },
      },
      create: {
        projectId: parsed.data.projectId,
        monthKey,
        plannedCents,
      },
      update: {
        plannedCents,
      },
    });
  });

  await recalculateUpgradeProjectTotals(parsed.data.projectId);
  revalidatePath("/upgrades");
}

export async function saveUpgradeActualMonthAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = saveUpgradeMonthValueSchema.safeParse({
    projectId: String(formData.get("projectId") ?? ""),
    monthKey: String(formData.get("monthKey") ?? ""),
    amount: String(formData.get("actual") ?? ""),
  });
  if (!parsed.success) {
    redirect("/upgrades?error=invalid_upgrade_actual_month");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  let actualCents = 0;
  try {
    actualCents = toCents(parsed.data.amount, { allowZero: true });
  } catch {
    redirect(`/upgrades?month=${encodeURIComponent(monthKey)}&error=invalid_upgrade_actual_month`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.upgradeActualMonth.upsert({
      where: {
        projectId_monthKey: {
          projectId: parsed.data.projectId,
          monthKey,
        },
      },
      create: {
        projectId: parsed.data.projectId,
        monthKey,
        actualCents,
      },
      update: {
        actualCents,
        loggedAt: new Date(),
      },
    });
  });

  await recalculateUpgradeProjectTotals(parsed.data.projectId);
  revalidatePath("/upgrades");
}

export async function deleteUpgradeProjectAction(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = deleteUpgradeProjectSchema.safeParse({
    projectId: String(formData.get("projectId") ?? ""),
  });
  if (!parsed.success) {
    redirect("/upgrades?error=invalid_upgrade_project_delete");
  }

  await prisma.upgradeProject.delete({
    where: { id: parsed.data.projectId },
  }).catch(() => {
    // Project may already be deleted in another tab.
  });

  revalidatePath("/upgrades");
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
    recurrenceMode: String(formData.get("recurrenceMode") ?? "").trim() || undefined,
    dueDay: String(formData.get("dueDay") ?? "").trim() || undefined,
    secondDueDay: String(formData.get("secondDueDay") ?? "").trim() || undefined,
    dueMonth: String(formData.get("dueMonth") ?? "").trim() || undefined,
    compare: String(formData.get("compare") ?? ""),
  });

  if (!parsed.success) {
    redirect("/planner?error=invalid_scenario_input");
  }

  const projectionItems = buildScenarioProjectionItems(parsed.data);
  const totals = aggregateScenarioTotals(projectionItems);
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
          recurrenceRule: item.recurrenceRule,
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
          recurrenceRule: item.recurrenceRule,
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
  const clock = getClock();
  const now = clock.now();
  const scenarioId = String(formData.get("scenarioId") ?? "").trim();
  const expectedVersion = Number(String(formData.get("expectedVersion") ?? "").trim());

  if (!scenarioId || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    redirect("/planner?error=invalid_apply_request");
  }

  await prisma.$transaction(async (tx) => {
    // Claim scenario atomically so duplicate submits cannot race.
    const claimed = await tx.scenario.updateMany({
      where: {
        id: scenarioId,
        status: "draft",
        version: expectedVersion,
      },
      data: {
        version: { increment: 1 },
      },
    });

    if (claimed.count === 0) {
      const existing = await tx.scenario.findUnique({
        where: { id: scenarioId },
        select: { id: true, status: true, version: true },
      });

      if (!existing) {
        throw new Error("Scenario not found.");
      }
      if (existing.status === "applied") {
        return;
      }
      throw new Error("Stale scenario version.");
    }

    const scenario = await tx.scenario.findUnique({
      where: { id: scenarioId },
      include: { items: true },
    });

    if (!scenario) {
      throw new Error("Scenario not found.");
    }

    const fallbackRecurrenceRule = buildRecurrenceRule("monthly_day", { dueDay: now.getDate() });

    for (const item of scenario.items) {
      if (item.itemType === "recurring") {
        await tx.bill.create({
          data: {
            name: item.label,
            category: item.category,
            amountCents: item.amountCents,
            recurrenceRule: item.recurrenceRule ?? fallbackRecurrenceRule,
            sourceScenarioItemId: item.id,
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
            sourceScenarioItemId: item.id,
          },
        });

        if (item.sourceKind === "upgrade") {
          await tx.upgrade.create({
            data: {
              title: item.label,
              category: "financed-upgrade",
              costCents: item.amountCents,
              loggedAt: now,
              sourceScenarioItemId: item.id,
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
          loggedAt: now,
          sourceScenarioItemId: item.id,
        },
      });
    }

    await tx.scenario.update({
      where: { id: scenario.id },
      data: {
        status: "applied",
        appliedAt: now,
      },
    });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Stale scenario")) {
      redirect("/planner?error=stale_scenario");
    }
    redirect("/planner?error=scenario_apply_failed");
  });
  await enqueueAnalyticsRecompute({
    sourceEventKey: `scenario_applied:${scenarioId}:${expectedVersion}`,
    triggerType: "scenario_applied",
    at: now,
  });
  void processQueuedAnalyticsJobs({ limit: 2 });

  revalidatePath("/planner");
  revalidatePath("/");
  redirect("/planner?success=scenario_applied");
}
