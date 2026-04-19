import { describe, expect, test } from "vitest";

import { normalizeUpgradeCategory, normalizeUpgradeTitle } from "@/lib/upgrades";

describe("upgrades helpers", () => {
  test("normalizes categories for uniqueness", () => {
    expect(normalizeUpgradeCategory("  Efficiency  ")).toBe("efficiency");
  });

  test("normalizes titles without changing case", () => {
    expect(normalizeUpgradeTitle("  Basement Insulation  ")).toBe("Basement Insulation");
  });
});
