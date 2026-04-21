import { calculateDeterministicCashOutlook, calculateMonthCoverage, getBudgetPageData } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

export type SupervisorToolResult = {
  toolName: string;
  summary: string;
  assumptions: string[];
  proposedActions: string[];
  confidence: "high" | "medium" | "low";
  sourceOfTruthUsed: string[];
};

export async function listUnreviewedImports(monthKey: string): Promise<SupervisorToolResult> {
  const batches = await prisma.budgetImportBatch.findMany({
    where: { monthKey },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const pendingCount = batches.filter((batch) => batch.parseStatus !== "ready_for_review" && batch.status !== "completed").length;
  return {
    toolName: "list_unreviewed_imports",
    summary: `${batches.length} recent imports found for ${monthKey}. ${pendingCount} still processing.`,
    assumptions: ["Import status is read from BudgetImportBatch.parseStatus and status."],
    proposedActions: pendingCount > 0 ? ["Wait for import processing to finish, then run categorization."] : ["Imports are ready for categorization review."],
    confidence: "high",
    sourceOfTruthUsed: ["budget_import_batch"],
  };
}

export async function proposeCategorization(monthKey: string): Promise<SupervisorToolResult> {
  const pendingSuggestions = await prisma.budgetAiSuggestion.count({
    where: { monthKey, status: "pending", suggestionType: "category_suggestion" },
  });
  const uncategorizedCount = await prisma.budgetTransaction.count({
    where: { monthKey, category: "uncategorized" },
  });
  return {
    toolName: "propose_categorization",
    summary: `${pendingSuggestions} category suggestions are awaiting approval. ${uncategorizedCount} transactions remain uncategorized.`,
    assumptions: ["Only pending category suggestions are included.", "No transaction updates are applied by this tool."],
    proposedActions: ["Open Review tab and approve high-confidence suggestions.", "Run AI cleanup if uncategorized count remains high."],
    confidence: pendingSuggestions > 0 || uncategorizedCount > 0 ? "medium" : "high",
    sourceOfTruthUsed: ["budget_ai_suggestion", "budget_transaction"],
  };
}

export async function approveCategorizationBatch(monthKey: string): Promise<SupervisorToolResult> {
  const pendingSuggestions = await prisma.budgetAiSuggestion.count({
    where: { monthKey, status: "pending", suggestionType: "category_suggestion" },
  });
  return {
    toolName: "approve_categorization_batch",
    summary: `Batch approval preview: ${pendingSuggestions} pending category suggestions can be reviewed.`,
    assumptions: ["This tool is preview-only and requires manual approval actions per suggestion."],
    proposedActions: ["Use per-item Accept in Review queue.", "Dismiss uncertain suggestions to keep memory clean."],
    confidence: "high",
    sourceOfTruthUsed: ["budget_ai_suggestion"],
  };
}

export async function getTransactionsByDate(args: { monthKey: string; postedDate: string }): Promise<SupervisorToolResult> {
  const rows = await prisma.budgetTransaction.findMany({
    where: {
      monthKey: args.monthKey,
      postedAt: {
        gte: new Date(`${args.postedDate}T00:00:00.000Z`),
        lt: new Date(`${args.postedDate}T23:59:59.999Z`),
      },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return {
    toolName: "get_transactions_by_date",
    summary: `${rows.length} transactions found for ${args.postedDate}.`,
    assumptions: ["Date lookup uses UTC day boundaries."],
    proposedActions: rows.length > 0 ? ["Ask for ranked transaction detail if needed."] : ["Try adjacent date or ensure that statement import completed."],
    confidence: "high",
    sourceOfTruthUsed: ["budget_transaction"],
  };
}

export async function getTransactionByRankForDay(args: {
  monthKey: string;
  postedDate: string;
  rank: number;
}): Promise<SupervisorToolResult> {
  const rows = await prisma.budgetTransaction.findMany({
    where: {
      monthKey: args.monthKey,
      postedAt: {
        gte: new Date(`${args.postedDate}T00:00:00.000Z`),
        lt: new Date(`${args.postedDate}T23:59:59.999Z`),
      },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
    take: 300,
  });
  const index = Math.max(0, args.rank - 1);
  const row = rows[index];
  if (!row) {
    return {
      toolName: "get_transaction_by_rank_for_day",
      summary: `No transaction at rank ${args.rank} for ${args.postedDate}.`,
      assumptions: ["Rank uses chronological order for the UTC day."],
      proposedActions: ["Request a smaller rank or query full date list first."],
      confidence: "medium",
      sourceOfTruthUsed: ["budget_transaction"],
    };
  }
  return {
    toolName: "get_transaction_by_rank_for_day",
    summary: `Rank ${args.rank} on ${args.postedDate}: ${row.description} (${(row.amountCents / 100).toFixed(2)} CAD).`,
    assumptions: ["Rank uses chronological order for the UTC day."],
    proposedActions: ["Open transaction list to verify category and merchant normalization."],
    confidence: "high",
    sourceOfTruthUsed: ["budget_transaction"],
  };
}

export async function getCashPosition(monthKey: string): Promise<SupervisorToolResult> {
  const budgetData = await getBudgetPageData(monthKey);
  const outlook = calculateDeterministicCashOutlook({
    monthKey,
    incomeCents: budgetData.overview.incomeCents,
    expensesCents: budgetData.overview.expensesCents,
  });
  return {
    toolName: "get_cash_position",
    summary: `Known net is ${(outlook.knownNetCents / 100).toFixed(2)} CAD. Projected month-end net is ${(outlook.projectedMonthEndNetCents / 100).toFixed(2)} CAD.`,
    assumptions: outlook.assumptions,
    proposedActions: ["Upload any missing account CSVs before relying on projection for decisions."],
    confidence: budgetData.overview.transactionCount > 0 ? "medium" : "low",
    sourceOfTruthUsed: ["budget_transaction", "budget_import_batch"],
  };
}

export async function getMonthlySummary(monthKey: string): Promise<SupervisorToolResult> {
  const budgetData = await getBudgetPageData(monthKey);
  const coverage = calculateMonthCoverage({
    transactionCount: budgetData.overview.transactionCount,
    uncategorizedCount: budgetData.overview.uncategorizedCount,
  });
  return {
    toolName: "get_monthly_summary",
    summary: `Income ${(budgetData.overview.incomeCents / 100).toFixed(2)} CAD, expenses ${(budgetData.overview.expensesCents / 100).toFixed(2)} CAD, net ${(budgetData.overview.netCents / 100).toFixed(2)} CAD, coverage ${coverage}%.`,
    assumptions: [
      `${budgetData.overview.uncategorizedCount} uncategorized rows are excluded from category-level certainty.`,
      `${budgetData.pendingSuggestions.length} pending suggestions may change totals after approval.`,
    ],
    proposedActions: ["Review pending suggestions to improve coverage confidence."],
    confidence: coverage >= 95 ? "high" : coverage >= 80 ? "medium" : "low",
    sourceOfTruthUsed: ["budget_transaction", "budget_ai_suggestion"],
  };
}

export async function getDebtsAndAprs(monthKey: string): Promise<SupervisorToolResult> {
  const snapshot = await prisma.homeProfileSnapshot.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      semiMonthlyPaymentCents: true,
      mortgageInterestRatePct: true,
      mortgageLender: true,
      mortgageTermEndMonthKey: true,
    },
  });
  if (!snapshot) {
    return {
      toolName: "get_debts_and_aprs",
      summary: "No debt profile found yet.",
      assumptions: ["Debt/APR details require an Our Home snapshot with mortgage fields."],
      proposedActions: ["Complete Our Home mortgage details to enable debt guidance."],
      confidence: "low",
      sourceOfTruthUsed: ["home_profile_snapshot"],
    };
  }
  return {
    toolName: "get_debts_and_aprs",
    summary: `Mortgage lender ${snapshot.mortgageLender ?? "unknown"}, APR ${snapshot.mortgageInterestRatePct.toString()}%, payment ${(snapshot.semiMonthlyPaymentCents / 100).toFixed(2)} CAD semi-monthly, term ends ${snapshot.mortgageTermEndMonthKey}.`,
    assumptions: [`Values are read from the most recent home snapshot at ${monthKey}.`],
    proposedActions: ["Use compare_debt_paydown_vs_investing for deterministic scenario guidance."],
    confidence: "high",
    sourceOfTruthUsed: ["home_profile_snapshot"],
  };
}

export async function compareDebtPaydownVsInvesting(monthKey: string): Promise<SupervisorToolResult> {
  const debt = await getDebtsAndAprs(monthKey);
  if (debt.confidence === "low") {
    return debt;
  }
  const aprMatch = debt.summary.match(/APR ([\d.]+)%/);
  const aprPct = aprMatch ? Number(aprMatch[1]) : NaN;
  const deterministicPreference = Number.isFinite(aprPct) && aprPct >= 7 ? "debt_paydown" : "balanced";
  return {
    toolName: "compare_debt_paydown_vs_investing",
    summary:
      deterministicPreference === "debt_paydown"
        ? "Deterministic comparison favors paying down debt first due to higher guaranteed APR savings."
        : "Debt APR appears moderate; balanced debt paydown and investing may be reasonable.",
    assumptions: [
      "Comparison is deterministic and uses debt APR only.",
      "No market-return guarantees are assumed.",
    ],
    proposedActions: ["Review debt APR and emergency buffer before changing contribution strategy."],
    confidence: "medium",
    sourceOfTruthUsed: ["home_profile_snapshot"],
  };
}
