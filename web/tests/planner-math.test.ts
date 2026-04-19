import { describe, expect, test } from "vitest";

import {
  aggregateScenarioTotals,
  projectFinancedItem,
  projectOneTimeItem,
  projectRecurringItem,
} from "@/lib/planner-math";

describe("planner math helpers", () => {
  test("projects recurring amounts to monthly and yearly totals", () => {
    expect(projectRecurringItem({ monthlyAmountCents: 45000 })).toEqual({
      monthlyCents: 45000,
      yearlyCents: 540000,
    });
  });

  test("calculates zero-interest financed item deterministically", () => {
    const projection = projectFinancedItem({
      principalCents: 1_200_000,
      annualRateBps: 0,
      termMonths: 24,
    });

    expect(projection.monthlyCents).toBe(50000);
    expect(projection.totalPaidCents).toBe(1_200_000);
    expect(projection.interestPaidCents).toBe(0);
  });

  test("calculates financed payment with interest", () => {
    const projection = projectFinancedItem({
      principalCents: 35_000_000,
      annualRateBps: 525,
      termMonths: 360,
    });

    expect(projection.monthlyCents).toBeGreaterThan(150000);
    expect(projection.interestPaidCents).toBeGreaterThan(0);
  });

  test("projects one-time amounts to monthly equivalent", () => {
    expect(projectOneTimeItem(12_000_00)).toEqual({
      oneTimeCents: 12_000_00,
      monthlyEquivalentCents: 100000,
      yearlyCents: 12_000_00,
    });
  });

  test("aggregates mixed scenario items into totals", () => {
    const totals = aggregateScenarioTotals([
      {
        kind: "recurring",
        label: "Utilities",
        category: "utility",
        monthlyCents: 20000,
        yearlyCents: 240000,
      },
      {
        kind: "financed",
        label: "Mortgage",
        category: "mortgage",
        principalCents: 30_000_000,
        annualRateBps: 550,
        termMonths: 360,
        monthlyCents: 170000,
        yearlyCents: 2_040_000,
        totalPaidCents: 61_200_000,
        interestPaidCents: 31_200_000,
      },
      {
        kind: "one_time",
        label: "Upgrade Principal",
        category: "upgrade",
        oneTimeCents: 600000,
        monthlyEquivalentCents: 50000,
        yearlyCents: 600000,
      },
    ]);

    expect(totals).toEqual({
      monthlyTotalCents: 240000,
      yearlyTotalCents: 2_880_000,
      recurringMonthlyCents: 20000,
      financedMonthlyCents: 170000,
      oneTimeCents: 600000,
    });
  });
});
