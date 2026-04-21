import { describe, expect, test } from "vitest";

import {
  buildBudgetFingerprint,
  normalizeMerchantName,
  parseBudgetAmount,
  parseCsv,
  summarizeBudgetTransactions,
} from "@/lib/budget";

describe("budget helpers", () => {
  test("parses csv with quoted fields", () => {
    const parsed = parseCsv(
      'date,description,amount\n2026-04-01,"GROCERY, STORE",-54.25\n2026-04-02,Payroll,2100.00',
    );
    expect(parsed.headers).toEqual(["date", "description", "amount"]);
    expect(parsed.rows[0]).toEqual(["2026-04-01", "GROCERY, STORE", "-54.25"]);
  });

  test("parses semicolon-delimited csv", () => {
    const parsed = parseCsv("date;details;withdrawal;deposit\n2026-04-01;Coffee;4.75;\n2026-04-02;Payroll;;2100.00");
    expect(parsed.headers).toEqual(["date", "details", "withdrawal", "deposit"]);
    expect(parsed.rows[0]).toEqual(["2026-04-01", "Coffee", "4.75", ""]);
  });

  test("normalizes merchant name for deterministic dedupe", () => {
    expect(normalizeMerchantName("  Uber*Trip #1234  ")).toBe("uber trip 1234");
  });

  test("builds stable dedupe fingerprint", () => {
    const fingerprint = buildBudgetFingerprint({
      postedAt: new Date("2026-04-10T12:00:00.000Z"),
      normalizedMerchant: "grocery store",
      amountCents: -10235,
    });
    expect(fingerprint).toBe("2026-04-10:grocery store:10235");
  });

  test("parses flexible amount formats safely", () => {
    expect(parseBudgetAmount("($54.25)")).toBe(-5425);
    expect(parseBudgetAmount("54.25-")).toBe(-5425);
    expect(parseBudgetAmount("54.25DR")).toBe(-5425);
    expect(parseBudgetAmount("54.25CR")).toBe(5425);
    expect(parseBudgetAmount("not-a-number")).toBe(0);
  });

  test("summarizes inflow/outflow and uncategorized count", () => {
    const summary = summarizeBudgetTransactions([
      { amountCents: 200000, category: "income" },
      { amountCents: -5000, category: "groceries" },
      { amountCents: -2500, category: "uncategorized" },
    ]);
    expect(summary).toEqual({
      incomeCents: 200000,
      expensesCents: 7500,
      netCents: 192500,
      transactionCount: 3,
      uncategorizedCount: 1,
    });
  });
});
