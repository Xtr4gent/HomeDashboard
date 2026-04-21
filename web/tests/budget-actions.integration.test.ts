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
const runBudgetSupervisorTaskMock = vi.fn();
const budgetAiSuggestionFindUniqueMock = vi.fn();
const budgetAiSuggestionUpdateMock = vi.fn();
const budgetTransactionUpdateMock = vi.fn();
const prismaTransactionMock = vi.fn();

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

vi.mock("@/lib/budget-supervisor", () => ({
  runBudgetSupervisorTask: runBudgetSupervisorTaskMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    budgetMonthlyTarget: {
      upsert: budgetTargetUpsertMock,
    },
    budgetTransaction: {
      update: budgetTransactionUpdateMock,
    },
    budgetAiSuggestion: {
      findUnique: budgetAiSuggestionFindUniqueMock,
      update: budgetAiSuggestionUpdateMock,
    },
    activityLog: {
      create: activityLogCreateMock,
    },
    $transaction: prismaTransactionMock,
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
      aiNormalizationUsed: false,
      aiNormalizationCostCents: 0,
    });
    cleanBudgetDataWithAiMock.mockResolvedValue({
      scannedRows: 12,
      updatedRows: 4,
      skippedRows: 8,
      acceptedSuggestions: 5,
      queuedForReview: 2,
      confidenceThreshold: 0.78,
      promptTokens: 450,
      completionTokens: 210,
      estimatedCostCents: 2,
    });
    runBudgetSupervisorTaskMock.mockResolvedValue({
      intent: "monthly_summary",
      title: "Monthly supervised summary",
      summary: "Your month is stable but review queue remains.",
      assumptions: ["Coverage is 80%."],
      proposedActions: ["Review pending queue"],
    });
    budgetAiSuggestionFindUniqueMock.mockResolvedValue({
      id: "sug-1",
      transactionId: "tx-1",
      status: "pending",
      suggestedCategory: "transport",
      suggestedMerchant: "uber trip",
      transaction: { id: "tx-1" },
    });
    budgetAiSuggestionUpdateMock.mockResolvedValue({});
    budgetTransactionUpdateMock.mockResolvedValue({});
    prismaTransactionMock.mockImplementation(async (callback: (tx: { budgetTransaction: { update: typeof budgetTransactionUpdateMock }; budgetAiSuggestion: { update: typeof budgetAiSuggestionUpdateMock } }) => Promise<void>) =>
      callback({
        budgetTransaction: { update: budgetTransactionUpdateMock },
        budgetAiSuggestion: { update: budgetAiSuggestionUpdateMock },
      }),
    );
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
      "REDIRECT:/budget?month=2025-10&tab=transactions&success=budget_imported&imported=2&duplicates=1&aiStatus=disabled&aiUpdated=0&aiQueued=0&aiCostCents=0",
    );
    expect(importBudgetCsvMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/budget");
  });

  test("importBudgetCsvAction can auto-categorize imported month", async () => {
    const { importBudgetCsvAction } = await import("@/app/actions");
    cleanBudgetDataWithAiMock.mockResolvedValueOnce({
      scannedRows: 5,
      updatedRows: 3,
      skippedRows: 2,
      acceptedSuggestions: 3,
      queuedForReview: 1,
      confidenceThreshold: 0.78,
      promptTokens: 120,
      completionTokens: 80,
      estimatedCostCents: 2,
    });
    importBudgetCsvMock.mockResolvedValueOnce({
      batchId: "batch-2",
      importedCount: 5,
      duplicateCount: 0,
      rowCount: 5,
      importedMonthKey: "2025-10",
      aiNormalizationUsed: true,
      aiNormalizationCostCents: 1,
    });
    const formData = new FormData();
    formData.set("accountName", "Joint");
    formData.set("monthKey", "2026-04");
    formData.set("autoCategorize", "on");
    formData.set("csvFile", new File(["date,description,amount\n2025-10-22,RANI,-223.55"], "sample.csv", { type: "text/csv" }));

    await expect(importBudgetCsvAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2025-10&tab=transactions&success=budget_imported&imported=5&duplicates=0&aiStatus=completed&aiUpdated=3&aiQueued=1&aiCostCents=3",
    );
    expect(cleanBudgetDataWithAiMock).toHaveBeenCalledWith({ monthKey: "2025-10" });
  });

  test("cleanBudgetDataWithAiAction redirects with success metadata", async () => {
    const { cleanBudgetDataWithAiAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");

    await expect(cleanBudgetDataWithAiAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=accounts&success=ai_cleanup&updated=4&queued=2&costCents=2",
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

  test("applyBudgetAiSuggestionAction updates transaction and marks suggestion applied", async () => {
    const { applyBudgetAiSuggestionAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");
    formData.set("suggestionId", "sug-1");

    await expect(applyBudgetAiSuggestionAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=review&success=ai_review_applied",
    );
    expect(budgetTransactionUpdateMock).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: {
        category: "transport",
        normalizedMerchant: "uber trip",
      },
    });
  });

  test("dismissBudgetAiSuggestionAction marks suggestion dismissed", async () => {
    const { dismissBudgetAiSuggestionAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");
    formData.set("suggestionId", "sug-1");

    await expect(dismissBudgetAiSuggestionAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=review&success=ai_review_dismissed",
    );
    expect(budgetAiSuggestionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sug-1" },
        data: expect.objectContaining({ status: "dismissed" }),
      }),
    );
  });

  test("runBudgetSupervisorAction redirects with supervisor payload", async () => {
    const { runBudgetSupervisorAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");
    formData.set("request", "what changed this month?");

    await expect(runBudgetSupervisorAction(formData)).rejects.toThrow(
      "REDIRECT:/budget?month=2026-04&tab=review&success=supervisor_done&supIntent=monthly_summary&supTitle=Monthly%20supervised%20summary&supSummary=Your%20month%20is%20stable%20but%20review%20queue%20remains.",
    );
    expect(runBudgetSupervisorTaskMock).toHaveBeenCalledWith({
      monthKey: "2026-04",
      request: "what changed this month?",
    });
  });
});
