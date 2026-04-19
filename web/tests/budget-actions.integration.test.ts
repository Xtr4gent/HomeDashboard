import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();
const budgetTargetUpsertMock = vi.fn();
const activityLogCreateMock = vi.fn();
const importBudgetCsvMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  clearSession: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth", () => ({
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  enqueueAnalyticsRecompute: vi.fn().mockResolvedValue(undefined),
  processQueuedAnalyticsJobs: vi.fn().mockResolvedValue(0),
  getAnalyticsTrendData: vi.fn().mockResolvedValue({ points: [], isStale: true, lastUpdatedAt: null }),
}));

vi.mock("@/lib/budget", () => ({
  importBudgetCsv: importBudgetCsvMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    budgetMonthlyTarget: {
      upsert: budgetTargetUpsertMock,
    },
    activityLog: {
      create: activityLogCreateMock,
    },
  },
}));

describe("budget actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", username: "Gabe" });
    budgetTargetUpsertMock.mockResolvedValue({ id: "target-1" });
    importBudgetCsvMock.mockResolvedValue({
      batchId: "batch-1",
      importedCount: 2,
      duplicateCount: 1,
      rowCount: 3,
    });
  });

  test("saveBudgetTargetAction upserts month/category target and revalidates", async () => {
    const { saveBudgetTargetAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");
    formData.set("category", "Groceries");
    formData.set("targetAmount", "450.00");

    await saveBudgetTargetAction(formData);

    expect(budgetTargetUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          monthKey_category: {
            monthKey: "2026-04",
            category: "groceries",
          },
        },
        create: expect.objectContaining({
          targetCents: 45000,
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
  });

  test("importBudgetCsvAction rejects missing file", async () => {
    const { importBudgetCsvAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("accountName", "Joint");
    formData.set("monthKey", "2026-04");

    await expect(importBudgetCsvAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=accounts&error=missing_csv_file",
    );
  });
});
