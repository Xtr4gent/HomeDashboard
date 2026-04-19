import { describe, expect, test } from "vitest";

import {
  buildProjectionOutliers,
  buildProjectionSummary,
  normalizeProjectionCategory,
  resolveProjectionMonthKey,
} from "@/lib/projections";

describe("projections helpers", () => {
  test("normalizes categories for month uniqueness", () => {
    expect(normalizeProjectionCategory("  Hydro  ")).toBe("hydro");
  });

  test("falls back to current month for invalid month keys", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    expect(resolveProjectionMonthKey("2026-07", now)).toBe("2026-07");
    expect(resolveProjectionMonthKey("2026-13", now)).toBe("2026-07");
    expect(resolveProjectionMonthKey(undefined, now)).toBe("2026-07");
  });

  test("computes planned, actual, and variance summaries", () => {
    const summary = buildProjectionSummary([
      { plannedCents: 12000, actualCents: 14000 },
      { plannedCents: 5000, actualCents: null },
      { plannedCents: 7500, actualCents: 6000 },
    ]);

    expect(summary).toEqual({
      plannedTotalCents: 24500,
      actualTotalCents: 20000,
      varianceTotalCents: -4500,
      actualCoverageCount: 2,
    });
  });

  test("finds largest overrun and underrun categories", () => {
    const outliers = buildProjectionOutliers([
      { id: "1", category: "hydro", plannedCents: 10000, actualCents: 14000, varianceCents: 4000 },
      { id: "2", category: "gas", plannedCents: 12000, actualCents: 9000, varianceCents: -3000 },
      { id: "3", category: "water", plannedCents: 8000, actualCents: 8200, varianceCents: 200 },
    ]);

    expect(outliers.largestOverrun?.category).toBe("hydro");
    expect(outliers.largestUnderrun?.category).toBe("gas");
  });
});
