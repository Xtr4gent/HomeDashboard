import { describe, expect, test } from "vitest";

import { toCents } from "@/lib/money";

describe("money helpers", () => {
  test("converts string and numeric values consistently", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents(12.34)).toBe(1234);
  });

  test("allows zero amounts only when explicitly enabled", () => {
    expect(() => toCents(0)).toThrowError("Amount must be a positive number.");
    expect(toCents(0, { allowZero: true })).toBe(0);
  });
});
