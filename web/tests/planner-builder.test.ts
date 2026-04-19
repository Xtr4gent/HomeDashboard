import { describe, expect, test } from "vitest";

import { buildScenarioProjectionItems } from "@/lib/planner-builder";
import type { PlannerInput } from "@/lib/planner-schema";

function baseInput(): PlannerInput {
  return {
    name: "Recurrence test scenario",
    notes: "",
    mortgagePrincipal: 350000,
    mortgageRateAnnualPct: 5.2,
    mortgageTermMonths: 300,
    propertyTaxMonthly: 350,
    insuranceMonthly: 120,
    utilitiesMonthly: 250,
    otherMonthly: 150,
    upgradeOneTimeCost: 0,
    upgradeSpreadMonths: 60,
    upgradeRateAnnualPct: 6.5,
    recurrenceMode: "monthly_day",
    dueDay: 15,
    compare: "",
  };
}

describe("planner builder recurrence", () => {
  test("propagates semi-monthly recurrence rule to recurring and financed items", () => {
    const items = buildScenarioProjectionItems({
      ...baseInput(),
      recurrenceMode: "semi_monthly",
      dueDay: 1,
      secondDueDay: 15,
    });

    expect(items.filter((item) => item.kind !== "one_time").every((item) => item.recurrenceRule === "semi_monthly_1_15")).toBe(
      true,
    );
  });

  test("propagates yearly recurrence rule with month/day", () => {
    const items = buildScenarioProjectionItems({
      ...baseInput(),
      recurrenceMode: "yearly",
      dueMonth: 9,
      dueDay: 7,
    });

    expect(items.filter((item) => item.kind !== "one_time").every((item) => item.recurrenceRule === "yearly_9_7")).toBe(
      true,
    );
  });

  test("keeps upgrade categories distinct from housing categories for split summaries", () => {
    const items = buildScenarioProjectionItems({
      ...baseInput(),
      upgradeOneTimeCost: 12000,
    });

    const upgradeItems = items.filter((item) => item.category === "upgrade");
    const housingItems = items.filter((item) => item.category !== "upgrade");

    expect(upgradeItems.length).toBeGreaterThan(0);
    expect(housingItems.length).toBeGreaterThan(0);
  });
});
