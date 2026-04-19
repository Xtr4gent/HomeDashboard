import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { prisma } from "@/lib/prisma";

const runRealDbIntegration = process.env.RUN_REAL_DB_INTEGRATION === "true";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ userId: "integration-user", username: "Gabe" }),
  clearSession: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth", () => ({
  authenticateUser: vi.fn(),
}));

describe.runIf(runRealDbIntegration)("planner actions (real DB integration)", () => {
  let scenarioId: string | null = null;
  let scenarioItemIds: string[] = [];

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (scenarioItemIds.length > 0) {
      await prisma.bill.deleteMany({
        where: { sourceScenarioItemId: { in: scenarioItemIds } },
      });
      await prisma.upgrade.deleteMany({
        where: { sourceScenarioItemId: { in: scenarioItemIds } },
      });
    }
    if (scenarioId) {
      await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    }
  });

  test("save -> apply writes durable outputs and marks scenario applied", async () => {
    const token = Date.now();
    const { saveScenarioAction, applyScenarioAction } = await import("@/app/actions");

    const saveForm = new FormData();
    saveForm.set("name", `Integration Planner ${token}`);
    saveForm.set("notes", "real db integration");
    saveForm.set("mortgagePrincipal", "350000");
    saveForm.set("mortgageRateAnnualPct", "5.20");
    saveForm.set("mortgageTermMonths", "300");
    saveForm.set("propertyTaxMonthly", "350");
    saveForm.set("insuranceMonthly", "120");
    saveForm.set("utilitiesMonthly", "250");
    saveForm.set("otherMonthly", "151");
    saveForm.set("upgradeOneTimeCost", "12000");
    saveForm.set("upgradeSpreadMonths", "60");
    saveForm.set("upgradeRateAnnualPct", "6.50");

    await expect(saveScenarioAction(saveForm)).rejects.toThrow("REDIRECT:/planner?success=scenario_saved");

    const savedScenario = await prisma.scenario.findFirst({
      where: { name: `Integration Planner ${token}`, status: "draft" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    expect(savedScenario).not.toBeNull();
    if (!savedScenario) {
      return;
    }

    scenarioId = savedScenario.id;
    scenarioItemIds = savedScenario.items.map((item) => item.id);

    const applyForm = new FormData();
    applyForm.set("scenarioId", savedScenario.id);
    applyForm.set("expectedVersion", String(savedScenario.version));

    await expect(applyScenarioAction(applyForm)).rejects.toThrow("REDIRECT:/planner?success=scenario_applied");

    const appliedScenario = await prisma.scenario.findUnique({
      where: { id: savedScenario.id },
      select: { status: true, appliedAt: true },
    });
    expect(appliedScenario?.status).toBe("applied");
    expect(appliedScenario?.appliedAt).toBeTruthy();

    const createdBills = await prisma.bill.count({
      where: { sourceScenarioItemId: { in: scenarioItemIds } },
    });
    const createdUpgrades = await prisma.upgrade.count({
      where: { sourceScenarioItemId: { in: scenarioItemIds } },
    });

    expect(createdBills).toBeGreaterThan(0);
    expect(createdUpgrades).toBeGreaterThan(0);
  });
});
