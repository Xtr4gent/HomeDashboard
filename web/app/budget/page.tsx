import Link from "next/link";
import { redirect } from "next/navigation";

import { importBudgetCsvAction, logoutAction, saveBudgetTargetAction } from "@/app/actions";
import { getSession } from "@/lib/auth/session";
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

export default async function BudgetPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const monthKey = resolveProjectionMonthKey(parseMonthParam(params.month));
  const tab = parseTabParam(params.tab);
  const budgetData = await getBudgetPageData(monthKey);
  const hasError = typeof params.error === "string";

  return (
    <div className="min-h-screen text-[color:var(--app-foreground)]">
      <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[color:var(--app-muted)]">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Budget Command</h1>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Dashboard
              </Link>
              <Link
                href="/planner"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Planner Lab
              </Link>
              <span className="rounded-md bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Budget
              </span>
              <Link
                href="/projections"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Projections
              </Link>
              <Link
                href="/upgrades"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Upgrades
              </Link>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-sm hover:bg-[color:var(--app-bg)]"
            >
              Logout {session.username}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {hasError ? (
          <div className="rounded-md border border-[color:var(--app-error)]/25 bg-[color:var(--app-error)]/10 px-4 py-3 text-sm text-[color:var(--app-error)]">
            Budget action failed. Review your CSV or input and retry.
          </div>
        ) : null}

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Month
              <input
                type="month"
                name="month"
                defaultValue={monthKey}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <input type="hidden" name="tab" value={tab} />
            <button
              type="submit"
              className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white"
            >
              Load month
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {BUDGET_TABS.map((budgetTab) => (
              <Link
                key={budgetTab}
                href={`/budget?month=${encodeURIComponent(monthKey)}&tab=${budgetTab}`}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${
                  tab === budgetTab
                    ? "bg-[color:var(--app-accent)] text-white"
                    : "border border-[color:var(--app-border)] text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
                }`}
              >
                {budgetTab}
              </Link>
            ))}
          </div>
        </section>

        {tab === "overview" ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
              <p className="text-sm text-[color:var(--app-muted)]">Income</p>
              <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(budgetData.overview.incomeCents)}</p>
            </article>
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
              <p className="text-sm text-[color:var(--app-muted)]">Expenses</p>
              <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(budgetData.overview.expensesCents)}</p>
            </article>
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
              <p className="text-sm text-[color:var(--app-muted)]">Net flow</p>
              <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(budgetData.overview.netCents)}</p>
            </article>
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
              <p className="text-sm text-[color:var(--app-muted)]">Uncategorized rows</p>
              <p className="font-data mt-1 text-2xl font-semibold">{budgetData.overview.uncategorizedCount}</p>
            </article>
          </section>
        ) : null}

        {tab === "transactions" ? (
          <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Transactions ({budgetData.transactions.length})</h2>
            <ul className="mt-3 space-y-2">
              {budgetData.transactions.slice(0, 120).map((transaction) => (
                <li key={transaction.id} className="flex items-center justify-between rounded-md border border-[color:var(--app-border)] px-3 py-2">
                  <div>
                    <p className="font-medium">{transaction.description}</p>
                    <p className="text-xs text-[color:var(--app-muted)]">
                      {transaction.postedAt.toISOString().slice(0, 10)} · {transaction.category}
                    </p>
                  </div>
                  <p className="font-data text-sm font-semibold">{formatSigned(transaction.amountCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "budgets" ? (
          <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Category budgets</h2>
            <div className="mt-3 space-y-2">
              {budgetData.budgets.map((budget) => (
                <form key={budget.category} action={saveBudgetTargetAction} className="grid gap-2 rounded-md border border-[color:var(--app-border)] p-3 sm:grid-cols-5 sm:items-end">
                  <input type="hidden" name="monthKey" value={monthKey} />
                  <input type="hidden" name="category" value={budget.category} />
                  <p className="text-sm font-medium capitalize">{budget.category}</p>
                  <p className="font-data text-sm">{formatCurrency(budget.actualCents)}</p>
                  <p className="font-data text-sm">{formatCurrency(budget.varianceCents)}</p>
                  <input
                    name="targetAmount"
                    defaultValue={(budget.targetCents / 100).toFixed(2)}
                    className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                  />
                  <button type="submit" className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white">
                    Save target
                  </button>
                </form>
              ))}
            </div>
            {budgetData.categoriesWithoutTargets.length > 0 ? (
              <div className="mt-4 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/60 p-3">
                <p className="text-sm text-[color:var(--app-muted)]">
                  Missing targets: {budgetData.categoriesWithoutTargets.join(", ")}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "trends" ? (
          <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Monthly trends</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {budgetData.trends.map((trend) => (
                <li key={trend.monthKey} className="rounded-md border border-[color:var(--app-border)] px-3 py-2">
                  <p className="text-xs text-[color:var(--app-muted)]">{trend.monthKey}</p>
                  <p className="font-data text-sm">Inflow {formatCurrency(trend.inflowCents)}</p>
                  <p className="font-data text-sm">Outflow {formatCurrency(trend.outflowCents)}</p>
                  <p className="font-data text-sm font-semibold">Net {formatCurrency(trend.netCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === "recurring" ? (
          <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Recurring spending signals</h2>
            {budgetData.recurring.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--app-muted)]">No recurring patterns found yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {budgetData.recurring.map((item) => (
                  <li key={item.merchant} className="rounded-md border border-[color:var(--app-border)] px-3 py-2">
                    <p className="font-medium capitalize">{item.merchant}</p>
                    <p className="text-xs text-[color:var(--app-muted)]">
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
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Import CSV</h2>
              <form action={importBudgetCsvAction} className="mt-3 grid gap-2">
                <input type="hidden" name="monthKey" value={monthKey} />
                <input
                  name="accountName"
                  placeholder="Account name (Joint Chequing)"
                  defaultValue="Joint Chequing"
                  className="rounded border border-[color:var(--app-border)] px-3 py-2"
                />
                <input
                  name="institution"
                  placeholder="Institution (optional)"
                  className="rounded border border-[color:var(--app-border)] px-3 py-2"
                />
                <input
                  type="file"
                  name="csvFile"
                  accept=".csv,text/csv"
                  className="rounded border border-[color:var(--app-border)] px-3 py-2"
                />
                <button type="submit" className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-semibold text-white">
                  Import transactions
                </button>
              </form>
            </article>
            <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Accounts and import history</h2>
              <p className="mt-2 text-sm text-[color:var(--app-muted)]">{budgetData.accounts.length} connected account profiles.</p>
              <ul className="mt-3 space-y-2">
                {budgetData.batches.map((batch) => (
                  <li key={batch.id} className="rounded-md border border-[color:var(--app-border)] px-3 py-2">
                    <p className="font-medium">{batch.account.name} · {batch.monthKey}</p>
                    <p className="text-xs text-[color:var(--app-muted)]">
                      {batch.status} · {batch.importedCount} imported · {batch.duplicateCount} duplicates
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}
