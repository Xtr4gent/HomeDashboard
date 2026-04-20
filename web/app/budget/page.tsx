import Link from "next/link";
import { redirect } from "next/navigation";

import { cleanBudgetDataWithAiAction, importBudgetCsvAction, logoutAction, saveBudgetTargetAction } from "@/app/actions";
import { AiCleanupButton } from "@/app/budget/ai-cleanup-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { getSession } from "@/lib/auth/session";
import { getBudgetAiPreflight } from "@/lib/budget-ai";
import { getBudgetPageData } from "@/lib/budget";
import { formatCurrency } from "@/lib/money";
import { resolveProjectionMonthKey } from "@/lib/projections";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BudgetTab = "overview" | "transactions" | "budgets" | "trends" | "recurring" | "accounts";

const BUDGET_TABS: BudgetTab[] = ["overview", "transactions", "budgets", "trends", "recurring", "accounts"];

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
  const monthKey = resolveProjectionMonthKey(parseMonthParam(params.month));
  const tab = parseTabParam(params.tab);
  const [budgetData, aiPreflight] = await Promise.all([getBudgetPageData(monthKey), getBudgetAiPreflight(monthKey)]);
  const errorCode = parseStringParam(params.error);
  const successCode = parseStringParam(params.success);
  const updatedCount = Number(parseStringParam(params.updated) ?? "0");
  const costCents = Number(parseStringParam(params.costCents) ?? "0");
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
            <span className="block rounded-xl bg-slate-100 px-3 py-2 font-semibold text-slate-900">Budget</span>
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
              {formatCurrency(Number.isFinite(costCents) ? costCents : 0)}.
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
                <li key={transaction.id} className="flex items-center justify-between rounded-xl border border-slate-700/80 bg-slate-950/65 px-3 py-3">
                  <div>
                    <p className="font-medium text-slate-100">{transaction.description}</p>
                    <p className="text-xs text-slate-400">
                      {transaction.postedAt.toISOString().slice(0, 10)} · {transaction.category}
                    </p>
                  </div>
                  <p className={`font-data text-sm font-semibold ${toneForNet(transaction.amountCents)}`}>
                    {formatSigned(transaction.amountCents)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "budgets" ? (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-100">Category budgets</h2>
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
              <form action={importBudgetCsvAction} className="mt-3 grid gap-2">
                <input type="hidden" name="monthKey" value={monthKey} />
                <input
                  name="accountName"
                  placeholder="Account name (Joint Chequing)"
                  defaultValue="Joint Chequing"
                  className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
                />
                <input
                  name="institution"
                  placeholder="Institution (optional)"
                  className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
                />
                <input
                  type="file"
                  name="csvFile"
                  accept=".csv,text/csv"
                  className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
                />
                <button type="submit" className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-95">
                  Import transactions
                </button>
              </form>
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
                      {batch.status} · {batch.importedCount} imported · {batch.duplicateCount} duplicates
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
        </div>
      </main>
    </div>
  );
}
