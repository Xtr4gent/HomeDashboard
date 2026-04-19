import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetClockForTests, setClockForTests } from "@/lib/clock";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();

let txMock: Record<string, unknown>;
const transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(txMock));
const activityLogCreateMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  clearSession: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth", () => ({
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  enqueueAnalyticsRecompute: vi.fn().mockResolvedValue(undefined),
  processQueuedAnalyticsJobs: vi.fn().mockResolvedValue(0),
  getAnalyticsTrendData: vi.fn().mockResolvedValue({ points: [], isStale: true, lastUpdatedAt: null }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    activityLog: {
      create: activityLogCreateMock,
    },
  },
}));

function buildPlannerFormData(extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("name", "Hardening Scenario");
  formData.set("notes", "integration test");
  formData.set("mortgagePrincipal", "350000");
  formData.set("mortgageRateAnnualPct", "5.2");
  formData.set("mortgageTermMonths", "300");
  formData.set("propertyTaxMonthly", "350");
  formData.set("insuranceMonthly", "120");
  formData.set("utilitiesMonthly", "250");
  formData.set("otherMonthly", "150");
  formData.set("upgradeOneTimeCost", "12000");
  formData.set("upgradeSpreadMonths", "60");
  formData.set("upgradeRateAnnualPct", "6.5");
  formData.set("recurrenceMode", "monthly_day");
  formData.set("dueDay", "18");
  formData.set("secondDueDay", "28");
  formData.set("dueMonth", "4");

  for (const [key, value] of Object.entries(extra)) {
    formData.set(key, value);
  }

  return formData;
}

describe("planner action hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", username: "Gabe" });
    resetClockForTests();
  });

  afterEach(() => {
    resetClockForTests();
  });

  test("saveScenarioAction persists selected recurrence rules", async () => {
    const fixedNow = new Date("2026-04-18T14:00:00.000Z");
    setClockForTests({ now: () => fixedNow });

    const scenarioCreate = vi.fn().mockResolvedValue({ id: "scenario-1" });
    const scenarioItemCreateMany = vi.fn().mockResolvedValue({ count: 7 });

    txMock = {
      scenario: { create: scenarioCreate },
      scenarioItem: { createMany: scenarioItemCreateMany },
    };

    const { saveScenarioAction } = await import("@/app/actions");

    await expect(saveScenarioAction(buildPlannerFormData())).rejects.toThrow(
      "REDIRECT:/planner?success=scenario_saved",
    );

    const createManyPayload = scenarioItemCreateMany.mock.calls[0]?.[0]?.data;
    expect(Array.isArray(createManyPayload)).toBe(true);
    expect(
      createManyPayload
        .filter((item: { itemType: string }) => item.itemType !== "one_time")
        .every((item: { recurrenceRule: string }) => item.recurrenceRule === "monthly_day_18"),
    ).toBe(true);
  });

  test("applyScenarioAction rejects stale claims before creating outputs", async () => {
    const scenarioUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const scenarioFindUnique = vi.fn().mockResolvedValue({
      id: "scenario-1",
      status: "draft",
      version: 9,
    });
    const billCreate = vi.fn();

    txMock = {
      scenario: { updateMany: scenarioUpdateMany, findUnique: scenarioFindUnique },
      bill: { create: billCreate },
      upgrade: { create: vi.fn() },
    };

    const { applyScenarioAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("scenarioId", "scenario-1");
    formData.set("expectedVersion", "1");

    await expect(applyScenarioAction(formData)).rejects.toThrow("REDIRECT:/planner?error=stale_scenario");
    expect(billCreate).not.toHaveBeenCalled();
  });

  test("applyScenarioAction marks scenario applied and stamps source ids", async () => {
    const fixedNow = new Date("2026-04-18T16:30:00.000Z");
    setClockForTests({ now: () => fixedNow });

    const scenarioUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const scenarioFindUnique = vi.fn().mockResolvedValue({
      id: "scenario-1",
      items: [
        {
          id: "item-recurring",
          itemType: "recurring",
          label: "Insurance",
          category: "insurance",
          amountCents: 12000,
          recurrenceRule: null,
        },
        {
          id: "item-financed",
          itemType: "financed",
          label: "Upgrade Financing",
          category: "upgrade",
          amountCents: 1200000,
          annualRateBps: 650,
          termMonths: 60,
          sourceKind: "upgrade",
          recurrenceRule: null,
        },
      ],
    });
    const billCreate = vi.fn().mockResolvedValue({ id: "bill-1" });
    const upgradeCreate = vi.fn().mockResolvedValue({ id: "upgrade-1" });
    const scenarioUpdate = vi.fn().mockResolvedValue({ id: "scenario-1" });

    txMock = {
      scenario: {
        updateMany: scenarioUpdateMany,
        findUnique: scenarioFindUnique,
        update: scenarioUpdate,
      },
      bill: { create: billCreate },
      upgrade: { create: upgradeCreate },
    };

    const { applyScenarioAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("scenarioId", "scenario-1");
    formData.set("expectedVersion", "1");

    await expect(applyScenarioAction(formData)).rejects.toThrow(
      "REDIRECT:/planner?success=scenario_applied",
    );

    expect(billCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceScenarioItemId: "item-recurring",
        }),
      }),
    );
    expect(upgradeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceScenarioItemId: "item-financed",
          loggedAt: fixedNow,
        }),
      }),
    );
    expect(scenarioUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "applied",
          appliedAt: fixedNow,
        }),
      }),
    );
  });

  test("cloneScenarioToDraftAction copies an applied scenario into a new draft", async () => {
    const scenarioFindUnique = vi.fn().mockResolvedValue({
      id: "scenario-applied-1",
      name: "Applied Scenario",
      notes: "already pushed",
      monthlyTotalCents: 100000,
      yearlyTotalCents: 1200000,
      financedMonthlyCents: 45000,
      recurringMonthlyCents: 55000,
      oneTimeCents: 120000,
      items: [
        {
          id: "item-a",
          label: "Mortgage",
          category: "mortgage",
          itemType: "financed",
          amountCents: 800000,
          recurrenceRule: "monthly_day_15",
          termMonths: 300,
          annualRateBps: 520,
          sourceKind: "housing",
        },
      ],
    });
    const scenarioCreate = vi.fn().mockResolvedValue({ id: "scenario-draft-2" });
    const scenarioItemCreateMany = vi.fn().mockResolvedValue({ count: 1 });

    txMock = {
      scenario: { findUnique: scenarioFindUnique, create: scenarioCreate },
      scenarioItem: { createMany: scenarioItemCreateMany },
    };

    const { cloneScenarioToDraftAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("scenarioId", "scenario-applied-1");

    await expect(cloneScenarioToDraftAction(formData)).rejects.toThrow(
      "REDIRECT:/planner?scenarioId=scenario-draft-2&success=scenario_cloned",
    );

    expect(scenarioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "draft",
          version: 1,
          appliedAt: null,
          name: "Applied Scenario (copy)",
        }),
      }),
    );
    expect(scenarioItemCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            scenarioId: "scenario-draft-2",
            label: "Mortgage",
          }),
        ],
      }),
    );
  });
});
