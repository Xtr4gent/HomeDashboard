import Link from "next/link";
import { redirect } from "next/navigation";

import {
  applyBudgetAiSuggestionAction,
  cleanBudgetDataWithAiAction,
  dismissBudgetAiSuggestionAction,
  importBudgetCsvAction,
  logoutAction,
  runBudgetSupervisorAction,
  saveBudgetTargetAction,
} from "@/app/actions";
import { AiCleanupButton } from "@/app/budget/ai-cleanup-button";
import { ImportCsvForm } from "@/app/budget/import-csv-form";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { getSession } from "@/lib/auth/session";
import { getBudgetAiPreflight } from "@/lib/budget-ai";
import { getBudgetPageData, getLatestImportedBudgetMonthKey, toReadableTransactionName } from "@/lib/budget";
import { formatCurrency } from "@/lib/money";
import { resolveProjectionMonthKey } from "@/lib/projections";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BudgetTab = "overview" | "transactions" | "budgets" | "trends" | "recurring" | "accounts" | "review";

const BUDGET_TABS: BudgetTab[] = ["overview", "transactions", "budgets", "trends", "recurring", "accounts", "review"];

function parseMonthParam(rawMonth: string | string[] | undefined): string | undefined {
  if (typeof rawMonth === "string") {
    return rawMonth;
  }
  return undefined;
}

function parseTabParam(rawTab: string | string[] | undefined): BudgetTab {
  if (typeof rawTab === "string" && BUDGET_TABS.includes(rawTab as BudgetTab)) {
    return rawTab as BudgetTab;
  }
  return "overview";
}

function parseStringParam(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  return undefined;
}

function formatSigned(cents: number): string {
  const absolute = formatCurrency(Math.abs(cents));
  if (cents < 0) {
    return `-${absolute}`;
  }
  if (cents > 0) {
    return `+${absolute}`;
  }
  return absolute;
}

function toneForNet(cents: number): string {
  if (cents > 0) {
    return "text-emerald-300";
  }
  if (cents < 0) {
    return "text-rose-300";
  }
  return "text-slate-200";
}

function toneForVariance(cents: number): string {
  if (cents <= 0) {
    return "text-emerald-300";
  }
  return "text-amber-300";
}

export default async function BudgetPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedMonthKey = parseMonthParam(params.month);
  const fallbackMonthKey = requestedMonthKey ? null : await getLatestImportedBudgetMonthKey();
  const monthKey = resolveProjectionMonthKey(requestedMonthKey ?? fallbackMonthKey ?? undefined);
  const tab = parseTabParam(params.tab);
  const [budgetData, aiPreflight] = await Promise.all([getBudgetPageData(monthKey), getBudgetAiPreflight(monthKey)]);
  const errorCode = parseStringParam(params.error);
  const successCode = parseStringParam(params.success);
  const updatedCount = Number(parseStringParam(params.updated) ?? "0");
  const costCents = Number(parseStringParam(params.costCents) ?? "0");
  const importedCount = Number(parseStringParam(params.imported) ?? "0");
  const duplicateCount = Number(parseStringParam(params.duplicates) ?? "0");
  const aiStatus = parseStringParam(params.aiStatus);
  const aiUpdatedCount = Number(parseStringParam(params.aiUpdated) ?? "0");
  const aiQueuedCount = Number(parseStringParam(params.aiQueued) ?? "0");
  const reviewQueuedCount = Number(parseStringParam(params.queued) ?? "0");
  const aiCostCents = Number(parseStringParam(params.aiCostCents) ?? "0");
  const aiError = parseStringParam(params.aiError)?.replaceAll("_", " ");
  const supervisorIntent = parseStringParam(params.supIntent);
  const supervisorTitle = parseStringParam(params.supTitle);
  const supervisorSummary = parseStringParam(params.supSummary);
  const supervisorSessionId = parseStringParam(params.supSessionId);
  const selectedCleanedBatchId = parseStringParam(params.cleanedBatch);
  const hasError = Boolean(errorCode);
  const readableError = errorCode ? errorCode.replaceAll("_", " ") : "";
  const totalFlow = budgetData.overview.incomeCents + budgetData.overview.expensesCents;
  const incomePct = totalFlow > 0 ? Math.round((budgetData.overview.incomeCents / totalFlow) * 100) : 0;
  const expensePct = totalFlow > 0 ? Math.round((budgetData.overview.expensesCents / totalFlow) * 100) : 0;
  const uncategorizedPct =
    budgetData.overview.transactionCount > 0
      ? Math.round((budgetData.overview.uncategorizedCount / budgetData.overview.transactionCount) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0b1f54_0%,#0d0f17_45%,#07080f_100%)] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/65 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">Budget Ledger</h1>
            <p className="mt-2 text-sm text-slate-400">Track imports, targets, and trends with the same nav placement as the dashboard.</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full border border-slate-600/70 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 hover:bg-slate-800"
              >
                Logout {session.username}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 backdrop-blur-xl">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Navigation</p>
          <nav className="space-y-1 text-sm">
            <Link
              href="/"
              className="block rounded-xl px-3 py-2 font-semibold text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/planner"
              className="block rounded-xl px-3 py-2 font-semibold text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
            >
              Our Home
            </Link>
            <Link
              href="/projections"
              className="block rounded-xl px-3 py-2 font-semibold text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
            >
              Projections
            </Link>
            <Link
              href="/upgrades"
              className="block rounded-xl px-3 py-2 font-semibold text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
            >
              Upgrades
            </Link>
            <span className="block rounded-xl bg-slate-100 px-3 py-2 font-semibold text-slate-950">Budget</span>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {hasError ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorCode === "openai_api_key_missing"
                ? "OpenAI key is missing. Set OPENAI_API_KEY before running AI cleanup."
                : errorCode === "openai_daily_limit_reached"
                  ? "AI cleanup daily limit reached. Try again tomorrow."
                  : errorCode === "openai_monthly_budget_reached"
                    ? "AI cleanup is blocked because your monthly AI budget cap was reached."
                  : readableError
                    ? `Budget action failed: ${readableError}.`
                    : "Budget action failed. Review your CSV or input and retry."}
            </div>
          ) : null}
          {successCode === "ai_cleanup" ? (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              AI cleanup completed. Updated {Number.isFinite(updatedCount) ? updatedCount : 0} transactions. Estimated cost{" "}
              {formatCurrency(Number.isFinite(costCents) ? costCents : 0)}.{" "}
              {reviewQueuedCount > 0 ? `${reviewQueuedCount} rows need your review in the Review tab.` : "No manual review needed."}
            </div>
          ) : null}
          {successCode === "budget_imported" ? (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              CSV imported successfully. Added {Number.isFinite(importedCount) ? importedCount : 0} transactions and skipped{" "}
              {Number.isFinite(duplicateCount) ? duplicateCount : 0} duplicates.{" "}
              {aiStatus === "completed"
                ? `AI auto-categorized ${Number.isFinite(aiUpdatedCount) ? aiUpdatedCount : 0} rows${aiQueuedCount > 0 ? ` and queued ${aiQueuedCount} low-confidence rows for review` : ""} (est. cost ${formatCurrency(Number.isFinite(aiCostCents) ? aiCostCents : 0)}).`
                : aiStatus === "skipped"
                  ? `AI auto-categorization skipped (${aiError ?? "unknown reason"}).`
                  : aiStatus === "queued"
                    ? "AI auto-categorization is queued."
                    : "AI auto-categorization is disabled."}{" "}
              Showing the imported month automatically.
            </div>
          ) : null}
          {successCode === "ai_review_applied" ? (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Applied AI suggestion. Transaction updated.
            </div>
          ) : null}
          {successCode === "ai_review_dismissed" ? (
            <div className="rounded-xl border border-slate-500/40 bg-slate-800/40 px-4 py-3 text-sm text-slate-200">
              Dismissed AI suggestion. No transaction changes were applied.
            </div>
          ) : null}
          {successCode === "supervisor_done" ? (
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
              Supervisor completed {supervisorIntent?.replaceAll("_", " ") ?? "request"}.
            </div>
          ) : null}

        <section className="rounded-3xl border border-slate-700/70 bg-slate-950/55 p-5 shadow-[0_20px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Month snapshot</p>
              <p className="mt-2 text-sm text-slate-300">Net position for {monthKey}</p>
              <p className={`font-data mt-3 text-5xl font-semibold ${toneForNet(budgetData.overview.netCents)}`}>
                {formatSigned(budgetData.overview.netCents)}
              </p>
              <div className="mt-5 space-y-3">
                <div className="rounded-full bg-slate-800/80 p-1">
                  <div
                    className="h-5 rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 text-right text-[11px] font-semibold text-slate-950 transition-all"
                    style={{ width: `${Math.max(incomePct, 6)}%` }}
                  >
                    <span className="mr-2">{incomePct}% income</span>
                  </div>
                </div>
                <div className="rounded-full bg-slate-800/80 p-1">
                  <div
                    className="h-5 rounded-full bg-gradient-to-r from-amber-300 to-orange-300 text-right text-[11px] font-semibold text-slate-950 transition-all"
                    style={{ width: `${Math.max(expensePct, 6)}%` }}
                  >
                    <span className="mr-2">{expensePct}% expenses</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Uncategorized pressure: {uncategorizedPct}% of transactions this month
                </p>
              </div>
            </div>
            <form method="get" className="grid gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Time controls</p>
              <label className="grid gap-1 text-sm text-slate-200">
                Month
                <input
                  type="month"
                  name="month"
                  defaultValue={monthKey}
                  className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
                />
              </label>
              <input type="hidden" name="tab" value={tab} />
              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-slate-100 to-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-95"
              >
                Load month
              </button>
            </form>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/45 p-2">
            {BUDGET_TABS.map((budgetTab) => (
              <Link
                key={budgetTab}
                href={`/budget?month=${encodeURIComponent(monthKey)}&tab=${budgetTab}`}
                className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  tab === budgetTab
                    ? "bg-gradient-to-r from-cyan-300 to-blue-300 text-slate-950"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}
              >
                {budgetTab}
              </Link>
            ))}
          </div>
        </section>

        {tab === "overview" ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Income</p>
              <p className="font-data mt-1 text-2xl font-semibold text-emerald-300">{formatCurrency(budgetData.overview.incomeCents)}</p>
            </article>
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Expenses</p>
              <p className="font-data mt-1 text-2xl font-semibold text-amber-300">{formatCurrency(budgetData.overview.expensesCents)}</p>
            </article>
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Net flow</p>
              <p className={`font-data mt-1 text-2xl font-semibold ${toneForNet(budgetData.overview.netCents)}`}>
                {formatCurrency(budgetData.overview.netCents)}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Uncategorized rows</p>
              <p className="font-data mt-1 text-2xl font-semibold text-slate-100">{budgetData.overview.uncategorizedCount}</p>
            </article>
          </section>
        ) : null}

        {tab === "transactions" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">Transactions ({budgetData.transactions.length})</h2>
            <ul className="mt-3 space-y-2">
              {budgetData.transactions.slice(0, 120).map((transaction) => (
                <li key={transaction.id} className="rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">
                          {toReadableTransactionName({
                            normalizedMerchant: transaction.normalizedMerchant,
                            description: transaction.description,
                          })}
                        </p>
                        <p className="text-xs text-slate-400">
                          {transaction.postedAt.toISOString().slice(0, 10)} · {transaction.category}
                        </p>
                      </div>
                      <p className={`font-data text-sm font-semibold ${toneForNet(transaction.amountCents)}`}>
                        {formatSigned(transaction.amountCents)}
                      </p>
                    </summary>
                    <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/80 p-3 text-xs text-slate-300">
                      <p>
                        <span className="text-slate-500">Original import name:</span> {transaction.description}
                      </p>
                      <p className="mt-1">
                        <span className="text-slate-500">Cleaned merchant:</span> {transaction.normalizedMerchant || "n/a"}
                      </p>
                      <p className="mt-1">
                        <span className="text-slate-500">Category:</span> {transaction.category}
                      </p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "budgets" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">Category budgets</h2>
            <p className="mt-2 text-sm text-slate-400">
              This is your category spend breakdown for {monthKey}. Set a target to track over/under.
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-5">
              <span>Category</span>
              <span>Spent</span>
              <span>Variance</span>
              <span className="sm:col-span-1">Target</span>
              <span className="hidden sm:block">Action</span>
            </div>
            <div className="mt-3 space-y-2">
              {budgetData.budgets.map((budget) => (
                <form
                  key={budget.category}
                  action={saveBudgetTargetAction}
                  className="grid gap-2 rounded-xl border border-slate-700/80 bg-slate-950/65 p-3 sm:grid-cols-5 sm:items-end"
                >
                  <input type="hidden" name="monthKey" value={monthKey} />
                  <input type="hidden" name="category" value={budget.category} />
                  <p className="text-sm font-medium capitalize text-slate-100">{budget.category}</p>
                  <p className="font-data text-sm text-slate-300">{formatCurrency(budget.actualCents)}</p>
                  <p className={`font-data text-sm ${toneForVariance(budget.varianceCents)}`}>{formatCurrency(budget.varianceCents)}</p>
                  <input
                    name="targetAmount"
                    defaultValue={(budget.targetCents / 100).toFixed(2)}
                    className="font-data rounded-xl border border-slate-600 bg-slate-900/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
                  />
                  <button type="submit" className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-95">
                    Save target
                  </button>
                </form>
              ))}
            </div>
            {budgetData.budgets.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/65 p-3">
                <p className="text-sm text-slate-300">No category spend yet for this month. Import a CSV in Accounts tab first.</p>
              </div>
            ) : null}
            {budgetData.categoriesWithoutTargets.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/65 p-3">
                <p className="text-sm text-slate-300">
                  Missing targets: {budgetData.categoriesWithoutTargets.join(", ")}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "trends" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">Monthly trends</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {budgetData.trends.map((trend) => (
                <li key={trend.monthKey} className="rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                  <p className="text-xs text-slate-400">{trend.monthKey}</p>
                  <p className="font-data text-sm text-emerald-300">Inflow {formatCurrency(trend.inflowCents)}</p>
                  <p className="font-data text-sm text-amber-300">Outflow {formatCurrency(trend.outflowCents)}</p>
                  <p className={`font-data text-sm font-semibold ${toneForNet(trend.netCents)}`}>Net {formatCurrency(trend.netCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "recurring" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">Recurring spending signals</h2>
            {budgetData.recurring.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No recurring patterns found yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {budgetData.recurring.map((item) => (
                  <li key={item.merchant} className="rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                    <p className="font-medium capitalize text-slate-100">{item.merchant}</p>
                    <p className="text-xs text-slate-400">
                      {item.count} hits · Avg {formatCurrency(item.averageAmountCents)} · Next {item.estimatedNextDate ?? "TBD"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "accounts" ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-100">Import CSV</h2>
              <ImportCsvForm monthKey={monthKey} action={importBudgetCsvAction} />
              <div className="mt-3">
                <AiCleanupButton monthKey={monthKey} preflight={aiPreflight} action={cleanBudgetDataWithAiAction} />
              </div>
            </article>
            <article className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-100">Accounts and import history</h2>
              <p className="mt-2 text-sm text-slate-400">{budgetData.accounts.length} connected account profiles.</p>
              <ul className="mt-3 space-y-2">
                {budgetData.batches.map((batch) => (
                  <li key={batch.id} className="rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                    <p className="font-medium text-slate-100">{batch.account.name} · {batch.monthKey}</p>
                    <p className="text-xs text-slate-400">
                      {batch.status} · {batch.importedCount} imported · {batch.duplicateCount} duplicates · {batch.cleanedRowCount} cleaned rows
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={`/budget?month=${encodeURIComponent(monthKey)}&tab=accounts&cleanedBatch=${encodeURIComponent(batch.id)}`}
                        className="rounded-md border border-slate-700 px-2 py-1 text-slate-200 transition hover:border-slate-500"
                      >
                        View cleaned data
                      </Link>
                      <Link
                        href={`/budget/cleaned/${encodeURIComponent(batch.id)}?format=csv`}
                        className="rounded-md border border-slate-700 px-2 py-1 text-slate-200 transition hover:border-slate-500"
                      >
                        Download cleaned CSV
                      </Link>
                    </div>
                    {selectedCleanedBatchId === batch.id ? (
                      <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/80 p-3">
                        {Array.isArray(batch.cleanedRowsJson) && batch.cleanedRowsJson.length > 0 ? (
                          <ul className="max-h-60 space-y-1 overflow-y-auto text-xs text-slate-300">
                            {batch.cleanedRowsJson.slice(0, 120).map((row, index) => {
                              if (!row || typeof row !== "object") {
                                return null;
                              }
                              const candidate = row as { postedAt?: unknown; description?: unknown; amountCents?: unknown };
                              if (
                                typeof candidate.postedAt !== "string" ||
                                typeof candidate.description !== "string" ||
                                typeof candidate.amountCents !== "number"
                              ) {
                                return null;
                              }
                              return (
                                <li key={`${batch.id}-${index}`} className="rounded-md border border-slate-800/70 px-2 py-1">
                                  {candidate.postedAt} · {candidate.description} · {formatSigned(candidate.amountCents)}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400">Cleaned data unavailable for this historical batch.</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
        {tab === "review" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">AI review queue</h2>
            <p className="mt-2 text-sm text-slate-400">
              Low-confidence suggestions are held here until you accept or dismiss them.
            </p>
            <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/65 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Supervisor</p>
              <form action={runBudgetSupervisorAction} className="mt-2 grid gap-2">
                <input type="hidden" name="monthKey" value={monthKey} />
                <input type="hidden" name="sessionId" value={supervisorSessionId ?? ""} />
                <textarea
                  name="request"
                  required
                  placeholder="Ask: What changed this month? / Show unknown merchants / Cash outlook until payday"
                  className="min-h-20 rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-violet-300 focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-fit rounded-xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-95"
                >
                  Run Supervisor
                </button>
              </form>
              {supervisorTitle && supervisorSummary ? (
                <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/80 p-3">
                  <p className="text-sm font-semibold text-slate-100">{supervisorTitle}</p>
                  <p className="mt-1 text-sm text-slate-300">{supervisorSummary}</p>
                </div>
              ) : null}
            </div>
            {budgetData.pendingSuggestions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No pending suggestions for {monthKey}.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {budgetData.pendingSuggestions.map((suggestion) => (
                  <li key={suggestion.id} className="rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                    <p className="font-medium text-slate-100">
                      {toReadableTransactionName({
                        normalizedMerchant: suggestion.suggestedMerchant,
                        description: suggestion.transaction.description,
                      })}{" "}
                      <span className="text-xs text-slate-400">({Math.round(Number(suggestion.confidence) * 100)}% confidence)</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      Suggestion: {suggestion.suggestedCategory} · {suggestion.suggestedMerchant}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">AI reason: {suggestion.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">Original: {suggestion.transaction.description}</p>
                    <div className="mt-3 flex gap-2">
                      <form action={applyBudgetAiSuggestionAction}>
                        <input type="hidden" name="monthKey" value={monthKey} />
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-95"
                        >
                          Accept
                        </button>
                      </form>
                      <form action={dismissBudgetAiSuggestionAction}>
                        <input type="hidden" name="monthKey" value={monthKey} />
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
                        >
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
        </div>
      </main>
    </div>
  );
}
