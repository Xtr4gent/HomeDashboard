import { beforeEach, describe, expect, test, vi } from "vitest";

const getBudgetPageDataMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL_ROUTER: "gpt-5.4-nano",
    OPENAI_MODEL_SUPERVISOR: "gpt-5.4-mini",
  },
}));

vi.mock("@/lib/budget", async () => {
  const actual = await vi.importActual<typeof import("@/lib/budget")>("@/lib/budget");
  return {
    ...actual,
    getBudgetPageData: getBudgetPageDataMock,
  };
});

describe("budget supervisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBudgetPageDataMock.mockResolvedValue({
      overview: {
        incomeCents: 500000,
        expensesCents: 410000,
        netCents: 90000,
        transactionCount: 12,
        uncategorizedCount: 3,
      },
      pendingSuggestions: [{ id: "s-1" }, { id: "s-2" }],
      recurring: [{ merchant: "netflix" }],
    });
  });

  test("routes unknown merchant requests to review workflow", async () => {
    const { runBudgetSupervisorTask } = await import("@/lib/budget-supervisor");
    const result = await runBudgetSupervisorTask({
      monthKey: "2026-04",
      request: "show me unknown merchants to review",
    });
    expect(result.intent).toBe("unknown_merchants_review");
    expect(result.proposedActions.length).toBeGreaterThan(0);
  });

  test("routes cash outlook requests and returns assumptions", async () => {
    const { runBudgetSupervisorTask } = await import("@/lib/budget-supervisor");
    const result = await runBudgetSupervisorTask({
      monthKey: "2026-04",
      request: "what is our cash outlook until payday?",
    });
    expect(result.intent).toBe("cash_outlook");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });
});
