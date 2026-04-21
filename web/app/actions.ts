"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/user-auth";
import { enqueueAnalyticsRecompute, processQueuedAnalyticsJobs } from "@/lib/analytics";
import { clearSession, createSession, getSession } from "@/lib/auth/session";
import { getClock } from "@/lib/clock";
import { importBudgetCsv } from "@/lib/budget";
import { cleanBudgetDataWithAi } from "@/lib/budget-ai";
import { buildScenarioProjectionItems } from "@/lib/planner-builder";
import { getDashboardData } from "@/lib/dashboard";
import { toCents } from "@/lib/money";
import { mapInputToSnapshotUpsert } from "@/lib/our-home";
import { saveHomeProfileSnapshotSchema } from "@/lib/our-home-schema";
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

const monthCloseSchema = z.object({
  monthKey: z.string().min(1),
});

const importBudgetCsvSchema = z.object({
  accountName: z.string().min(1),
  institution: z.string().optional(),
  monthKey: z.string().min(1),
  autoCategorize: z.boolean().optional(),
});

const saveBudgetTargetSchema = z.object({
  monthKey: z.string().min(1),
  category: z.string().min(1),
  targetAmount: z.string().min(1),
});

const cleanBudgetDataWithAiSchema = z.object({
  monthKey: z.string().min(1),
});

const reviewBudgetAiSuggestionSchema = z.object({
  suggestionId: z.string().min(1),
  monthKey: z.string().min(1),
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

async function logActivity(args: {
  action:
    | "bill_added"
    | "bill_paid"
    | "upgrade_added"
    | "projection_saved"
    | "projection_deleted"
    | "upgrade_project_saved"
    | "upgrade_project_deleted"
    | "scenario_saved"
    | "scenario_applied"
    | "home_profile_saved"
    | "month_closed"
    | "month_reopened"
    | "budget_imported"
    | "budget_target_saved"
    | "budget_transaction_updated"
    | "budget_ai_suggestion_reviewed";
  actorUsername: string;
  entityType: string;
  entityId?: string;
  monthKey?: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.activityLog.create({
    data: {
      action: args.action,
      actorUsername: args.actorUsername,
      monthKey: args.monthKey,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      summary: args.summary,
      metadata: args.metadata,
    },
  });
}

async function runBudgetAiCleanupAndLog(args: {
  actorUsername: string;
  monthKey: string;
  source: "ai_cleanup" | "ai_import_autocategorize";
}): Promise<Awaited<ReturnType<typeof cleanBudgetDataWithAi>>> {
  const result = await cleanBudgetDataWithAi({ monthKey: args.monthKey });
  await logActivity({
    action: "budget_transaction_updated",
    actorUsername: args.actorUsername,
    entityType: "budget_transaction",
    monthKey: args.monthKey,
    summary: `AI cleanup updated ${result.updatedRows} rows`,
    metadata: {
      source: args.source,
      scannedRows: result.scannedRows,
      updatedRows: result.updatedRows,
      skippedRows: result.skippedRows,
      acceptedSuggestions: result.acceptedSuggestions,
      queuedForReview: result.queuedForReview,
      confidenceThreshold: result.confidenceThreshold,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      estimatedCostCents: result.estimatedCostCents,
    },
  });
  return result;
}

export async function addBillAction(formData: FormData): Promise<void> {
  const session = await requireSession();
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
  await logActivity({
    action: "bill_added",
    actorUsername: session.username,
    entityType: "bill",
    entityId: createdBill.id,
    summary: `Added bill ${createdBill.name}`,
  });
  await enqueueAnalyticsRecompute({
    sourceEventKey: `bill_created:${createdBill.id}:${createdBill.updatedAt.toISOString()}`,
    triggerType: "bill_created",
  });
  void processQueuedAnalyticsJobs({ limit: 2 });

  revalidatePath("/");
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const session = await requireSession();

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
    await logActivity({
      action: "bill_paid",
      actorUsername: session.username,
      entityType: "payment",
      entityId: payment.id,
      monthKey,
      summary: `Marked ${bill.id} paid for ${monthKey}`,
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
  const session = await requireSession();
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
  await logActivity({
    action: "upgrade_added",
    actorUsername: session.username,
    entityType: "upgrade",
    entityId: createdUpgrade.id,
    monthKey: monthKeyFromDate(createdUpgrade.loggedAt),
    summary: `Logged upgrade ${createdUpgrade.title}`,
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
  const session = await requireSession();

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

  const projection = await prisma.utilityProjection.upsert({
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
  await logActivity({
    action: "projection_saved",
    actorUsername: session.username,
    entityType: "utility_projection",
    entityId: projection.id,
    monthKey,
    summary: `Saved projection for ${category} (${monthKey})`,
  });

  revalidatePath("/projections");
}

export async function deleteUtilityProjectionAction(formData: FormData): Promise<void> {
  const session = await requireSession();

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
  await logActivity({
    action: "projection_deleted",
    actorUsername: session.username,
    entityType: "utility_projection",
    entityId: parsed.data.projectionId,
    summary: "Deleted utility projection row",
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
  const session = await requireSession();
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
    const updatedProject = await prisma.upgradeProject.update({
      where: { id: parsed.data.projectId },
      data: payload,
    }).catch(() => {
      redirect(`/upgrades?month=${encodeURIComponent(startMonthKey)}&error=invalid_upgrade_project`);
    });
    await logActivity({
      action: "upgrade_project_saved",
      actorUsername: session.username,
      entityType: "upgrade_project",
      entityId: updatedProject.id,
      monthKey: targetMonthKey,
      summary: `Updated upgrade project ${updatedProject.title}`,
    });
  } else {
    const createdProject = await prisma.upgradeProject.create({
      data: payload,
    });
    await logActivity({
      action: "upgrade_project_saved",
      actorUsername: session.username,
      entityType: "upgrade_project",
      entityId: createdProject.id,
      monthKey: targetMonthKey,
      summary: `Created upgrade project ${createdProject.title}`,
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
  const session = await requireSession();
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
  await logActivity({
    action: "upgrade_project_deleted",
    actorUsername: session.username,
    entityType: "upgrade_project",
    entityId: parsed.data.projectId,
    summary: "Deleted upgrade project",
  });

  revalidatePath("/upgrades");
}

export async function saveHomeProfileSnapshotAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = saveHomeProfileSnapshotSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
    propertyAddress: String(formData.get("propertyAddress") ?? ""),
    semiMonthlyPayment: String(formData.get("semiMonthlyPayment") ?? ""),
    mortgageInterestRatePct: String(formData.get("mortgageInterestRatePct") ?? ""),
    mortgageTermYears: String(formData.get("mortgageTermYears") ?? ""),
    mortgageTermStartMonthKey: String(formData.get("mortgageTermStartMonthKey") ?? ""),
    mortgageLender: String(formData.get("mortgageLender") ?? ""),
    mortgageNotes: String(formData.get("mortgageNotes") ?? ""),
    propertyTaxYearly: String(formData.get("propertyTaxYearly") ?? ""),
    waterMonthly: String(formData.get("waterMonthly") ?? ""),
    gasMonthly: String(formData.get("gasMonthly") ?? ""),
    hydroMonthly: String(formData.get("hydroMonthly") ?? ""),
  });

  if (!parsed.success) {
    redirect("/planner?error=invalid_home_profile_input");
  }

  const payload = mapInputToSnapshotUpsert(parsed.data);
  await prisma.homeProfileSnapshot.upsert({
    where: { monthKey: payload.monthKey },
    create: payload,
    update: payload,
  });

  await logActivity({
    action: "home_profile_saved",
    actorUsername: session.username,
    entityType: "home_profile_snapshot",
    monthKey: payload.monthKey,
    summary: `Saved home profile snapshot for ${payload.monthKey}`,
    metadata: {
      mortgageTermYears: payload.mortgageTermYears,
      mortgageInterestRatePct: payload.mortgageInterestRatePct,
      hasLender: Boolean(payload.mortgageLender),
    },
  });

  revalidatePath("/planner");
  revalidatePath("/");
  redirect(`/planner?month=${encodeURIComponent(payload.monthKey)}&success=home_profile_saved`);
}

export async function cloneScenarioToDraftAction(formData: FormData): Promise<void> {
  await requireSession();
  const scenarioId = String(formData.get("scenarioId") ?? "").trim();
  if (!scenarioId) {
    redirect("/planner?error=scenario_not_found");
  }

  const cloned = await prisma.$transaction(async (tx) => {
    const sourceScenario = await tx.scenario.findUnique({
      where: { id: scenarioId },
      include: { items: true },
    });

    if (!sourceScenario) {
      return null;
    }

    const createdScenario = await tx.scenario.create({
      data: {
        name: `${sourceScenario.name} (copy)`,
        notes: sourceScenario.notes,
        status: "draft",
        version: 1,
        monthlyTotalCents: sourceScenario.monthlyTotalCents,
        yearlyTotalCents: sourceScenario.yearlyTotalCents,
        financedMonthlyCents: sourceScenario.financedMonthlyCents,
        recurringMonthlyCents: sourceScenario.recurringMonthlyCents,
        oneTimeCents: sourceScenario.oneTimeCents,
        appliedAt: null,
      },
      select: { id: true },
    });

    if (sourceScenario.items.length > 0) {
      await tx.scenarioItem.createMany({
        data: sourceScenario.items.map((item) => ({
          scenarioId: createdScenario.id,
          label: item.label,
          category: item.category,
          itemType: item.itemType,
          amountCents: item.amountCents,
          recurrenceRule: item.recurrenceRule,
          termMonths: item.termMonths,
          annualRateBps: item.annualRateBps,
          sourceKind: item.sourceKind,
        })),
      });
    }

    return createdScenario;
  });

  if (!cloned) {
    redirect("/planner?error=scenario_not_found");
  }

  revalidatePath("/planner");
  redirect(`/planner?scenarioId=${encodeURIComponent(cloned.id)}&success=scenario_cloned`);
}

export async function saveScenarioAction(formData: FormData): Promise<void> {
  const session = await requireSession();
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
  await logActivity({
    action: "scenario_saved",
    actorUsername: session.username,
    entityType: "scenario",
    entityId: parsed.data.scenarioId,
    summary: `Saved planner scenario ${parsed.data.name}`,
  });
  redirect("/planner?success=scenario_saved");
}

export async function applyScenarioAction(formData: FormData): Promise<void> {
  const session = await requireSession();
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
  await logActivity({
    action: "scenario_applied",
    actorUsername: session.username,
    entityType: "scenario",
    entityId: scenarioId,
    monthKey: monthKeyFromDate(now),
    summary: "Applied scenario to live dashboard",
  });
  void processQueuedAnalyticsJobs({ limit: 2 });

  revalidatePath("/planner");
  revalidatePath("/");
  redirect("/planner?success=scenario_applied");
}

export async function closeMonthAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = monthCloseSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/?error=invalid_month_close");
  }

  const dashboard = await getDashboardData(new Date(`${parsed.data.monthKey}-15T12:00:00.000Z`));
  const monthKey = dashboard.monthKey;
  const closeRecord = await prisma.monthClose.upsert({
    where: { monthKey },
    create: {
      monthKey,
      status: "locked",
      totalMonthlyCostCents: dashboard.totalMonthlyCostCents,
      cashflowThisMonthCostCents: dashboard.cashflowThisMonthCostCents,
      projectedYearlyCostCents: dashboard.projectedYearlyCostCents,
      utilitiesTotalCents: dashboard.utilitiesTotalCents,
      upgradesTotalCents: dashboard.upgradesTotalCents,
      utilityProjectionVarianceCents: dashboard.utilityProjection.varianceCents,
      upgradeProjectionVarianceCents: dashboard.upgradeProjection.varianceCents,
      closedByUsername: session.username,
      closedAt: new Date(),
    },
    update: {
      status: "locked",
      totalMonthlyCostCents: dashboard.totalMonthlyCostCents,
      cashflowThisMonthCostCents: dashboard.cashflowThisMonthCostCents,
      projectedYearlyCostCents: dashboard.projectedYearlyCostCents,
      utilitiesTotalCents: dashboard.utilitiesTotalCents,
      upgradesTotalCents: dashboard.upgradesTotalCents,
      utilityProjectionVarianceCents: dashboard.utilityProjection.varianceCents,
      upgradeProjectionVarianceCents: dashboard.upgradeProjection.varianceCents,
      closedByUsername: session.username,
      closedAt: new Date(),
      reopenedAt: null,
    },
  });

  await logActivity({
    action: "month_closed",
    actorUsername: session.username,
    entityType: "month_close",
    entityId: closeRecord.id,
    monthKey,
    summary: `Closed month ${monthKey}`,
  });
  revalidatePath("/");
}

export async function reopenMonthAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = monthCloseSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/?error=invalid_month_close");
  }

  const reopened = await prisma.monthClose.update({
    where: { monthKey: parsed.data.monthKey },
    data: {
      status: "reopened",
      reopenedAt: new Date(),
    },
  }).catch(() => null);

  if (reopened) {
    await logActivity({
      action: "month_reopened",
      actorUsername: session.username,
      entityType: "month_close",
      entityId: reopened.id,
      monthKey: reopened.monthKey,
      summary: `Reopened month ${reopened.monthKey}`,
    });
  }
  revalidatePath("/");
}

export async function importBudgetCsvAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = importBudgetCsvSchema.safeParse({
    accountName: String(formData.get("accountName") ?? ""),
    institution: String(formData.get("institution") ?? "").trim() || undefined,
    monthKey: String(formData.get("monthKey") ?? ""),
    autoCategorize: String(formData.get("autoCategorize") ?? "") === "on",
  });
  if (!parsed.success) {
    redirect("/budget?error=invalid_budget_import");
  }

  const csvFile = formData.get("csvFile");
  if (!(csvFile instanceof File) || csvFile.size === 0) {
    redirect(`/budget?month=${encodeURIComponent(parsed.data.monthKey)}&tab=accounts&error=missing_csv_file`);
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  const csvContent = await csvFile.text();
  let importRedirectMonthKey = monthKey;
  let importRedirectSuccess = "";
  let importRedirectImported = "0";
  let importRedirectDuplicates = "0";
  let importRedirectAiStatus = "disabled";
  let importRedirectAiUpdated = "0";
  let importRedirectAiCostCents = "0";
  let importRedirectAiQueued = "0";
  let importRedirectAiError = "";
  try {
    const result = await importBudgetCsv({
      accountName: parsed.data.accountName,
      institution: parsed.data.institution,
      monthKey,
      csvContent,
    });
    importRedirectMonthKey = result.importedMonthKey || monthKey;
    importRedirectSuccess = "budget_imported";
    importRedirectImported = String(result.importedCount);
    importRedirectDuplicates = String(result.duplicateCount);
    importRedirectAiCostCents = String(result.aiNormalizationCostCents ?? 0);
    importRedirectAiStatus = parsed.data.autoCategorize ? "queued" : "disabled";
    await logActivity({
      action: "budget_imported",
      actorUsername: session.username,
      entityType: "budget_import_batch",
      entityId: result.batchId,
      monthKey,
      summary: `Imported ${result.importedCount} transactions (${result.duplicateCount} duplicates)`,
      metadata: {
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        aiNormalizationUsed: result.aiNormalizationUsed,
        aiNormalizationCostCents: result.aiNormalizationCostCents,
      },
    });
    if (parsed.data.autoCategorize) {
      try {
        const cleanup = await runBudgetAiCleanupAndLog({
          actorUsername: session.username,
          monthKey: importRedirectMonthKey,
          source: "ai_import_autocategorize",
        });
        importRedirectAiStatus = "completed";
        importRedirectAiUpdated = String(cleanup.updatedRows);
        importRedirectAiQueued = String(cleanup.queuedForReview);
        importRedirectAiCostCents = String((result.aiNormalizationCostCents ?? 0) + cleanup.estimatedCostCents);
      } catch (aiError: unknown) {
        importRedirectAiStatus = "skipped";
        importRedirectAiError = encodeURIComponent(aiError instanceof Error ? aiError.message : "ai_cleanup_failed");
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "budget_import_failed";
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=accounts&error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/budget");
  redirect(
    `/budget?month=${encodeURIComponent(importRedirectMonthKey)}&tab=transactions&success=${importRedirectSuccess}&imported=${importRedirectImported}&duplicates=${importRedirectDuplicates}&aiStatus=${importRedirectAiStatus}&aiUpdated=${importRedirectAiUpdated}&aiQueued=${importRedirectAiQueued}&aiCostCents=${importRedirectAiCostCents}${importRedirectAiError ? `&aiError=${importRedirectAiError}` : ""}`,
  );
}

export async function saveBudgetTargetAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = saveBudgetTargetSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
    category: String(formData.get("category") ?? ""),
    targetAmount: String(formData.get("targetAmount") ?? ""),
  });
  if (!parsed.success) {
    redirect("/budget?error=invalid_budget_target");
  }
  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  const category = parsed.data.category.trim().toLowerCase();
  if (!category) {
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=budgets&error=invalid_budget_category`);
  }

  let targetCents = 0;
  try {
    targetCents = toCents(parsed.data.targetAmount, { allowZero: true });
  } catch {
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=budgets&error=invalid_budget_target`);
  }

  const target = await prisma.budgetMonthlyTarget.upsert({
    where: {
      monthKey_category: {
        monthKey,
        category,
      },
    },
    update: {
      targetCents,
    },
    create: {
      monthKey,
      category,
      targetCents,
    },
  });
  await logActivity({
    action: "budget_target_saved",
    actorUsername: session.username,
    entityType: "budget_monthly_target",
    entityId: target.id,
    monthKey,
    summary: `Saved budget target for ${category}`,
  });
  revalidatePath("/budget");
}

export async function cleanBudgetDataWithAiAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = cleanBudgetDataWithAiSchema.safeParse({
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/budget?tab=accounts&error=invalid_budget_ai_cleanup");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  let result: Awaited<ReturnType<typeof cleanBudgetDataWithAi>>;
  try {
    result = await runBudgetAiCleanupAndLog({
      actorUsername: session.username,
      monthKey,
      source: "ai_cleanup",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "budget_ai_cleanup_failed";
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=accounts&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/budget");
  redirect(
    `/budget?month=${encodeURIComponent(monthKey)}&tab=accounts&success=ai_cleanup&updated=${result.updatedRows}&queued=${result.queuedForReview}&costCents=${result.estimatedCostCents}`,
  );
}

export async function applyBudgetAiSuggestionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = reviewBudgetAiSuggestionSchema.safeParse({
    suggestionId: String(formData.get("suggestionId") ?? ""),
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/budget?tab=review&error=invalid_ai_review");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  const suggestion = await prisma.budgetAiSuggestion.findUnique({
    where: { id: parsed.data.suggestionId },
    include: { transaction: true },
  });
  if (!suggestion || suggestion.status !== "pending") {
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=review&error=ai_review_not_found`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.budgetTransaction.update({
      where: { id: suggestion.transactionId },
      data: {
        category: suggestion.suggestedCategory,
        normalizedMerchant: suggestion.suggestedMerchant,
      },
    });
    await tx.budgetAiSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: "applied",
        reviewedBy: session.username,
        reviewedAt: new Date(),
      },
    });
  });

  await logActivity({
    action: "budget_ai_suggestion_reviewed",
    actorUsername: session.username,
    entityType: "budget_ai_suggestion",
    entityId: suggestion.id,
    monthKey,
    summary: "Applied queued AI suggestion",
    metadata: {
      decision: "applied",
      transactionId: suggestion.transactionId,
    },
  });
  revalidatePath("/budget");
  redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=review&success=ai_review_applied`);
}

export async function dismissBudgetAiSuggestionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = reviewBudgetAiSuggestionSchema.safeParse({
    suggestionId: String(formData.get("suggestionId") ?? ""),
    monthKey: String(formData.get("monthKey") ?? ""),
  });
  if (!parsed.success) {
    redirect("/budget?tab=review&error=invalid_ai_review");
  }

  const monthKey = resolveProjectionMonthKey(parsed.data.monthKey);
  const suggestion = await prisma.budgetAiSuggestion.findUnique({
    where: { id: parsed.data.suggestionId },
  });
  if (!suggestion || suggestion.status !== "pending") {
    redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=review&error=ai_review_not_found`);
  }

  await prisma.budgetAiSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status: "dismissed",
      reviewedBy: session.username,
      reviewedAt: new Date(),
    },
  });
  await logActivity({
    action: "budget_ai_suggestion_reviewed",
    actorUsername: session.username,
    entityType: "budget_ai_suggestion",
    entityId: suggestion.id,
    monthKey,
    summary: "Dismissed queued AI suggestion",
    metadata: {
      decision: "dismissed",
      transactionId: suggestion.transactionId,
    },
  });
  revalidatePath("/budget");
  redirect(`/budget?month=${encodeURIComponent(monthKey)}&tab=review&success=ai_review_dismissed`);
}
