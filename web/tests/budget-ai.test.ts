import { beforeEach, describe, expect, test, vi } from "vitest";

const activityLogFindManyMock = vi.fn();
const budgetTransactionCountMock = vi.fn();
const budgetTransactionFindManyMock = vi.fn();
const budgetTransactionUpdateMock = vi.fn();
const budgetAiSuggestionUpsertMock = vi.fn();
const budgetAiSuggestionDeleteManyMock = vi.fn();
const prismaTransactionMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_BUDGET_CENTS_MONTHLY: 500,
    OPENAI_MAX_ROWS_PER_RUN: 5,
    OPENAI_MAX_RUNS_PER_DAY: 2,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      findMany: activityLogFindManyMock,
    },
    budgetTransaction: {
      count: budgetTransactionCountMock,
      findMany: budgetTransactionFindManyMock,
      update: budgetTransactionUpdateMock,
    },
    budgetAiSuggestion: {
      upsert: budgetAiSuggestionUpsertMock,
      deleteMany: budgetAiSuggestionDeleteManyMock,
    },
    $transaction: prismaTransactionMock,
  },
}));

describe("budget ai cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransactionMock.mockImplementation(async (callback: (tx: {
      budgetTransaction: { update: typeof budgetTransactionUpdateMock };
      budgetAiSuggestion: {
        upsert: typeof budgetAiSuggestionUpsertMock;
        deleteMany: typeof budgetAiSuggestionDeleteManyMock;
      };
    }) => Promise<void>) =>
      callback({
        budgetTransaction: {
          update: budgetTransactionUpdateMock,
        },
        budgetAiSuggestion: {
          upsert: budgetAiSuggestionUpsertMock,
          deleteMany: budgetAiSuggestionDeleteManyMock,
        },
      }),
    );
    activityLogFindManyMock.mockResolvedValue([]);
    budgetTransactionCountMock.mockResolvedValue(0);
    budgetTransactionFindManyMock.mockResolvedValue([]);
    budgetTransactionUpdateMock.mockResolvedValue(undefined);
    budgetAiSuggestionUpsertMock.mockResolvedValue(undefined);
    budgetAiSuggestionDeleteManyMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  test("builds preflight estimate with cap-aware values", async () => {
    const { getBudgetAiPreflight } = await import("@/lib/budget-ai");
    activityLogFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        metadata: {
          source: "ai_cleanup",
          estimatedCostCents: 130,
        },
      },
    ]);
    budgetTransactionCountMock.mockResolvedValueOnce(12);

    const preflight = await getBudgetAiPreflight("2026-04");

    expect(preflight.rowsPlanned).toBe(5);
    expect(preflight.monthlyRemainingCents).toBe(370);
    expect(preflight.runsLeftToday).toBe(2);
    expect(preflight.estimatedHighCostCents).toBeGreaterThanOrEqual(preflight.estimatedLowCostCents);
  });

  test("blocks cleanup when daily run limit is reached", async () => {
    const { cleanBudgetDataWithAi } = await import("@/lib/budget-ai");
    activityLogFindManyMock
      .mockResolvedValueOnce([
        { metadata: { source: "ai_cleanup", estimatedCostCents: 2 } },
        { metadata: { source: "ai_cleanup", estimatedCostCents: 2 } },
      ])
      .mockResolvedValueOnce([]);
    budgetTransactionCountMock.mockResolvedValueOnce(8);

    await expect(cleanBudgetDataWithAi({ monthKey: "2026-04" })).rejects.toThrow("openai_daily_limit_reached");
  });

  test("queues suggestions and requires manual approval for all changes", async () => {
    const { cleanBudgetDataWithAi } = await import("@/lib/budget-ai");
    activityLogFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    budgetTransactionCountMock.mockResolvedValueOnce(2);
    budgetTransactionFindManyMock.mockResolvedValueOnce([
      {
        id: "tx-1",
        description: "UBER BV",
        normalizedMerchant: "uber bv",
        amountCents: -1525,
        category: "uncategorized",
      },
      {
        id: "tx-2",
        description: "MYSTERY CHARGE",
        normalizedMerchant: "mystery charge",
        amountCents: -999,
        category: "uncategorized",
      },
    ]);

    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                updates: [
                  {
                    transactionId: "tx-1",
                    normalizedMerchant: "uber trip",
                    category: "transport",
                    confidence: 0.93,
                    reason: "Consistent with rideshare pattern.",
                  },
                  {
                    transactionId: "tx-2",
                    normalizedMerchant: "misc vendor",
                    category: "shopping",
                    confidence: 0.42,
                    reason: "Weak confidence suggestion.",
                  },
                ],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 200,
        },
      }),
    } as Response);

    const result = await cleanBudgetDataWithAi({ monthKey: "2026-04" });

    expect(result.updatedRows).toBe(0);
    expect(result.acceptedSuggestions).toBe(1);
    expect(result.queuedForReview).toBe(2);
    expect(result.skippedRows).toBe(0);
    expect(result.estimatedCostCents).toBeGreaterThanOrEqual(1);
    expect(budgetTransactionUpdateMock).not.toHaveBeenCalled();
    expect(budgetAiSuggestionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: "tx-2" },
        create: expect.objectContaining({
          suggestedCategory: "shopping",
          suggestedMerchant: "misc vendor",
          status: "pending",
        }),
      }),
    );
    expect(budgetAiSuggestionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: "tx-1" },
      }),
    );
  });
});
