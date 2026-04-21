import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();
const budgetTargetUpsertMock = vi.fn();
const activityLogCreateMock = vi.fn();
const importBudgetCsvMock = vi.fn();
const cleanBudgetDataWithAiMock = vi.fn();

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

vi.mock("@/lib/budget-ai", () => ({
  cleanBudgetDataWithAi: cleanBudgetDataWithAiMock,
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
      importedMonthKey: "2025-10",
    });
    cleanBudgetDataWithAiMock.mockResolvedValue({
      scannedRows: 12,
      updatedRows: 4,
      skippedRows: 8,
      acceptedSuggestions: 5,
      confidenceThreshold: 0.78,
      promptTokens: 450,
      completionTokens: 210,
      estimatedCostCents: 2,
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

  test("importBudgetCsvAction redirects to imported month with success metadata", async () => {
    const { importBudgetCsvAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("accountName", "Joint");
    formData.set("monthKey", "2026-04");
    formData.set("csvFile", new File(["date,description,amount\n2025-10-22,RANI,-223.55"], "sample.csv", { type: "text/csv" }));

    await expect(importBudgetCsvAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2025-10&tab=transactions&success=budget_imported&imported=2&duplicates=1",
    );
    expect(importBudgetCsvMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
  });

  test("cleanBudgetDataWithAiAction redirects with success metadata", async () => {
    const { cleanBudgetDataWithAiAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");

    await expect(cleanBudgetDataWithAiAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=accounts&success=ai_cleanup&updated=4&costCents=2",
    );
    expect(cleanBudgetDataWithAiMock).toHaveBeenCalledWith({ monthKey: "2026-04" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
  });

  test("cleanBudgetDataWithAiAction maps budget-cap errors to query string", async () => {
    const { cleanBudgetDataWithAiAction } = await import("@/app/actions");
    cleanBudgetDataWithAiMock.mockRejectedValueOnce(new Error("openai_monthly_budget_reached"));
    const formData = new FormData();
    formData.set("monthKey", "2026-04");

    await expect(cleanBudgetDataWithAiAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=accounts&error=openai_monthly_budget_reached",
    );
  });
});
