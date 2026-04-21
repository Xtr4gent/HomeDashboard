import { beforeEach, describe, expect, test, vi } from "vitest";

const ensureSessionCreateMock = vi.fn();
const sessionUpdateMock = vi.fn();
const getMonthlySummaryMock = vi.fn();
const getCashPositionMock = vi.fn();
const proposeCategorizationMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL_ROUTER: "gpt-5.4-nano",
    OPENAI_MODEL_SUPERVISOR: "gpt-5.4-mini",
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    budgetSupervisorSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: ensureSessionCreateMock,
      update: sessionUpdateMock,
    },
  },
}));

vi.mock("@/lib/budget-supervisor-tools", () => ({
  getMonthlySummary: getMonthlySummaryMock,
  getCashPosition: getCashPositionMock,
  proposeCategorization: proposeCategorizationMock,
  listUnreviewedImports: vi.fn(),
  approveCategorizationBatch: vi.fn(),
}));

describe("budget supervisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureSessionCreateMock.mockResolvedValue({
      id: "sess-1",
    });
    sessionUpdateMock.mockResolvedValue({ id: "sess-1" });
    getMonthlySummaryMock.mockResolvedValue({
      toolName: "get_monthly_summary",
      summary: "Monthly summary.",
      assumptions: ["a1"],
      proposedActions: ["p1"],
      confidence: "high",
      sourceOfTruthUsed: ["budget_transaction"],
    });
    getCashPositionMock.mockResolvedValue({
      toolName: "get_cash_position",
      summary: "Cash outlook summary.",
      assumptions: ["a1", "a2"],
      proposedActions: ["p1"],
      confidence: "medium",
      sourceOfTruthUsed: ["budget_transaction"],
    });
    proposeCategorizationMock.mockResolvedValue({
      toolName: "propose_categorization",
      summary: "Review unknown merchants.",
      assumptions: ["a1"],
      proposedActions: ["p1"],
      confidence: "medium",
      sourceOfTruthUsed: ["budget_ai_suggestion"],
    });
  });

  test("routes unknown merchant requests to review workflow", async () => {
    const { runBudgetSupervisorTask } = await import("@/lib/budget-supervisor");
    const result = await runBudgetSupervisorTask({
      monthKey: "2026-04",
      request: "show me unknown merchants to review",
      actorUsername: "gabe",
    });
    expect(result.intent).toBe("unknown_merchants_review");
    expect(result.sessionId).toBe("sess-1");
    expect(result.toolName).toBe("propose_categorization");
    expect(result.proposedActions.length).toBeGreaterThan(0);
  });

  test("routes cash outlook requests and returns assumptions", async () => {
    const { runBudgetSupervisorTask } = await import("@/lib/budget-supervisor");
    const result = await runBudgetSupervisorTask({
      monthKey: "2026-04",
      request: "what is our cash outlook until payday?",
      actorUsername: "gabe",
    });
    expect(result.intent).toBe("cash_outlook");
    expect(result.toolName).toBe("get_cash_position");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });
});
