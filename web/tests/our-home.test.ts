import { describe, expect, test } from "vitest";

import {
  computeMonthlyMortgagePaymentCents,
  computeMonthlyPropertyTaxCents,
  deriveMortgageTermEndMonthKey,
  mapInputToSnapshotUpsert,
} from "@/lib/our-home";

describe("our-home helpers", () => {
  test("computes monthly mortgage from semi-monthly schedule", () => {
    expect(computeMonthlyMortgagePaymentCents(125_000)).toBe(250_000);
  });

  test("computes monthly property tax from yearly total", () => {
    expect(computeMonthlyPropertyTaxCents(6_000_00)).toBe(50_000);
    expect(computeMonthlyPropertyTaxCents(6_500_00)).toBe(54_167);
  });

  test("derives term end month from start month and years", () => {
    expect(deriveMortgageTermEndMonthKey("2026-01", 5)).toBe("2030-12");
    expect(deriveMortgageTermEndMonthKey("2026-07", 5)).toBe("2031-06");
  });

  test("maps form input into snapshot upsert payload", () => {
    const payload = mapInputToSnapshotUpsert({
      monthKey: "2026-04",
      propertyAddress: "123 Main St, Toronto, ON",
      semiMonthlyPayment: 1250.55,
      mortgageInterestRatePct: 4.875,
      mortgageTermYears: 5,
      mortgageTermStartMonthKey: "2026-01",
      mortgageLender: "ABC Bank",
      mortgageNotes: "Renewal in 2030",
      propertyTaxYearly: 6500,
      waterMonthly: 62.25,
      gasMonthly: 71.4,
      hydroMonthly: 118.9,
    });

    expect(payload).toMatchObject({
      monthKey: "2026-04",
      propertyAddress: "123 Main St, Toronto, ON",
      semiMonthlyPaymentCents: 125_055,
      mortgageInterestRatePct: "4.875",
      mortgageTermYears: 5,
      mortgageTermStartMonthKey: "2026-01",
      mortgageTermEndMonthKey: "2030-12",
      mortgageLender: "ABC Bank",
      mortgageNotes: "Renewal in 2030",
      propertyTaxYearlyCents: 650_000,
      waterMonthlyCents: 6_225,
      gasMonthlyCents: 7_140,
      hydroMonthlyCents: 11_890,
    });
  });
});
