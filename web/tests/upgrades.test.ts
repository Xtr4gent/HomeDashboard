import { describe, expect, test } from "vitest";

import { filterUpgradeProjects, normalizeUpgradeCategory, normalizeUpgradeTitle } from "@/lib/upgrades";

describe("upgrades helpers", () => {
  test("normalizes categories for uniqueness", () => {
    expect(normalizeUpgradeCategory("  Efficiency  ")).toBe("efficiency");
  });

  test("normalizes titles without changing case", () => {
    expect(normalizeUpgradeTitle("  Basement Insulation  ")).toBe("Basement Insulation");
  });

  test("filters projects by view mode", () => {
    const projects = [
      {
        id: "1",
        title: "Heat pump",
        category: "efficiency",
        notes: null,
        status: "planned" as const,
        startMonthKey: "2026-05",
        targetMonthKey: "2026-10",
        monthPlannedCents: 0,
        monthActualCents: null,
        monthVarianceCents: null,
        plannedTotalCents: 0,
        actualTotalCents: 0,
        isOverdueTarget: false,
      },
      {
        id: "2",
        title: "Roof",
        category: "safety",
        notes: null,
        status: "in_progress" as const,
        startMonthKey: "2026-01",
        targetMonthKey: "2026-03",
        monthPlannedCents: 0,
        monthActualCents: null,
        monthVarianceCents: null,
        plannedTotalCents: 0,
        actualTotalCents: 0,
        isOverdueTarget: true,
      },
      {
        id: "3",
        title: "Windows",
        category: "efficiency",
        notes: null,
        status: "completed" as const,
        startMonthKey: "2026-02",
        targetMonthKey: "2026-04",
        monthPlannedCents: 0,
        monthActualCents: null,
        monthVarianceCents: null,
        plannedTotalCents: 0,
        actualTotalCents: 0,
        isOverdueTarget: false,
      },
    ];

    expect(filterUpgradeProjects(projects, "active")).toHaveLength(2);
    expect(filterUpgradeProjects(projects, "overdue")).toHaveLength(1);
    expect(filterUpgradeProjects(projects, "completed")).toHaveLength(1);
    expect(filterUpgradeProjects(projects, "all")).toHaveLength(3);
  });
});
