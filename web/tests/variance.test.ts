import { describe, expect, test } from "vitest";

import { buildVarianceSummary } from "@/lib/variance";

describe("variance helpers", () => {
  test("builds totals and variance for mixed planned/actual rows", () => {
    const summary = buildVarianceSummary([
      { plannedCents: 10000, actualCents: 11000 },
      { plannedCents: 20000, actualCents: null },
      { plannedCents: 30000, actualCents: 29000 },
    ]);

    expect(summary).toEqual({
      plannedTotalCents: 60000,
      actualTotalCents: 40000,
      varianceTotalCents: -20000,
      actualCoverageCount: 2,
      totalCount: 3,
    });
  });
});
