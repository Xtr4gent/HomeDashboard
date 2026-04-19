import { describe, expect, test } from "vitest";

import { buildScenarioProjectionItems } from "@/lib/planner-builder";
import { plannerInputSchema } from "@/lib/planner-schema";

describe("planner action contracts", () => {
  test("validates planner input payload shape", () => {
    const parsed = plannerInputSchema.safeParse({
      name: "Starter plan",
      notes: "",
      mortgagePrincipal: "350000",
      mortgageRateAnnualPct: "5.3",
      mortgageTermMonths: "300",
      propertyTaxMonthly: "350",
      insuranceMonthly: "120",
      utilitiesMonthly: "250",
      otherMonthly: "90",
      upgradeOneTimeCost: "12000",
      upgradeSpreadMonths: "60",
      upgradeRateAnnualPct: "6.8",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.mortgageTermMonths).toBe(300);
    expect(parsed.data.upgradeSpreadMonths).toBe(60);
  });

  test("builds scenario projection items including financed and recurring records", () => {
    const parsed = plannerInputSchema.parse({
      name: "Compare option A",
      notes: "with upgrade",
      mortgagePrincipal: "420000",
      mortgageRateAnnualPct: "5.1",
      mortgageTermMonths: "300",
      propertyTaxMonthly: "420",
      insuranceMonthly: "130",
      utilitiesMonthly: "260",
      otherMonthly: "110",
      upgradeOneTimeCost: "18000",
      upgradeSpreadMonths: "72",
      upgradeRateAnnualPct: "7.4",
    });

    const items = buildScenarioProjectionItems(parsed);
    const recurring = items.filter((item) => item.kind === "recurring");
    const financed = items.filter((item) => item.kind === "financed");
    const oneTime = items.filter((item) => item.kind === "one_time");

    expect(recurring).toHaveLength(4);
    expect(financed).toHaveLength(2);
    expect(oneTime).toHaveLength(1);
  });
});
