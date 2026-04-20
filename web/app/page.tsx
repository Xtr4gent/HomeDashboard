import { redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";

import {
  addBillAction,
  closeMonthAction,
  addUpgradeAction,
  logoutAction,
  markPaidAction,
  reopenMonthAction,
} from "@/app/actions";
import { getAnalyticsTrendData } from "@/lib/analytics";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/money";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseForecastWeeks(raw: string | string[] | undefined): 4 | 8 | 12 {
  if (raw === "4" || raw === "12") {
    return Number(raw) as 4 | 12;
  }
  return 8;
}

function parseRiskOnly(raw: string | string[] | undefined): boolean {
  return raw === "1" || raw === "true";
}

function statusClasses(status: string): string {
  if (status === "overdue") {
    return "border-[color:var(--app-error)]/20 bg-[color:var(--app-error)]/12 text-[color:var(--app-error)]";
  }
  if (status === "due_soon") {
    return "border-[color:var(--app-warning)]/20 bg-[color:var(--app-warning)]/12 text-[color:var(--app-warning)]";
  }
  if (status === "paid_this_month") {
    return "border-[color:var(--app-success)]/20 bg-[color:var(--app-success)]/12 text-[color:var(--app-success)]";
  }
  if (status === "not_due_this_month") {
    return "border-[color:var(--app-border)] bg-[color:var(--app-bg)] text-[color:var(--app-muted)]";
  }
  return "border-[color:var(--app-info)]/20 bg-[color:var(--app-info)]/12 text-[color:var(--app-info)]";
}

export default async function Home({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const forecastWeeks = parseForecastWeeks(params.forecastWeeks);
  const riskOnlyForecast = parseRiskOnly(params.riskOnlyForecast);
  const [dashboard, analytics] = await Promise.all([
    getDashboardData(new Date(), { forecastWeeks, riskOnlyForecast }),
    getAnalyticsTrendData(),
  ]);

  const dashboardTheme = {
    "--app-bg": "#eef2f8",
    "--app-surface": "#f8fafc",
    "--app-foreground": "#0f172a",
    "--app-muted": "#64748b",
    "--app-accent": "#2563eb",
    "--app-border": "#dbe2ee",
    "--app-success": "#15803d",
    "--app-warning": "#c2410c",
    "--app-error": "#b91c1c",
    "--app-info": "#1d4ed8",
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#192246_0%,#0f1737_45%,#090d1f_100%)] text-[color:var(--app-foreground)]">
      <div
        style={dashboardTheme}
        className="grid min-h-screen w-full overflow-hidden border border-slate-200 bg-[color:var(--app-surface)] shadow-[0_40px_100px_rgba(2,6,23,0.45)] lg:grid-cols-[260px_1fr] 2xl:grid-cols-[290px_1fr]"
      >
        <aside className="flex flex-col border-r border-[color:var(--app-border)] bg-white/70 p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--app-border)] bg-white px-3 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              HD
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">HomeDashboard</p>
              <p className="text-xs text-[color:var(--app-muted)]">Charts version</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1 text-sm">
            <span className="block rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white">Overview</span>
            <Link href="/planner" className="block rounded-xl px-3 py-2 text-slate-600 transition hover:bg-white hover:text-slate-900">
              Planner Lab
            </Link>
            <Link href="/budget" className="block rounded-xl px-3 py-2 text-slate-600 transition hover:bg-white hover:text-slate-900">
              Budget
            </Link>
            <Link href="/projections" className="block rounded-xl px-3 py-2 text-slate-600 transition hover:bg-white hover:text-slate-900">
              Projections
            </Link>
            <Link href="/upgrades" className="block rounded-xl px-3 py-2 text-slate-600 transition hover:bg-white hover:text-slate-900">
              Upgrades
            </Link>
          </nav>

          <div className="mt-auto rounded-2xl border border-[color:var(--app-border)] bg-white p-3">
            <p className="text-xs text-[color:var(--app-muted)]">Signed in as</p>
            <p className="mb-3 text-sm font-semibold text-slate-900">{session.username}</p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Logout
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-[color:var(--app-border)] bg-white/75 px-4 py-4 backdrop-blur sm:px-6 xl:px-8 2xl:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full max-w-xl">
                <label className="sr-only" htmlFor="dashboardSearch">
                  Search
                </label>
                <input
                  id="dashboardSearch"
                  placeholder="Search dashboard..."
                  className="w-full rounded-full border border-[color:var(--app-border)] bg-white px-4 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300"
                />
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-white p-1 text-xs font-semibold text-slate-500">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-white">Today</span>
                <span className="rounded-full px-3 py-1">Week</span>
                <span className="rounded-full px-3 py-1">Month</span>
                <span className="rounded-full px-3 py-1">Year</span>
              </div>
            </div>
          </header>

          <main className="flex w-full min-w-0 flex-col gap-6 bg-[color:var(--app-bg)] px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
            <section className="rounded-2xl border border-[color:var(--app-border)] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--app-muted)]">Overview</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">House Ops Dashboard</h1>
              <p className="mt-2 text-sm text-[color:var(--app-muted)]">
                Overdue: {dashboard.overdueCount} · Due soon: {dashboard.dueSoonCount} · Unpaid this month:{" "}
                {dashboard.unpaidCount}
              </p>
            </section>
        {params.error ? (
          <div className="rounded-md border border-[color:var(--app-error)]/25 bg-[color:var(--app-error)]/10 px-4 py-3 text-sm text-[color:var(--app-error)]">
            Something went wrong with that action. Please review the input and try again.
          </div>
        ) : null}

        <section className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 shadow-[0_8px_24px_rgba(31,36,48,0.08)] sm:p-6">
          <h2 className="text-lg font-semibold">Urgent Actions</h2>
          <p className="mt-1 text-sm text-[color:var(--app-muted)]">
            Overdue: {dashboard.overdueCount} · Due soon: {dashboard.dueSoonCount} · Unpaid this month:{" "}
            {dashboard.unpaidCount}
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
            <h2 className="text-base font-semibold">Monthly Close</h2>
            {dashboard.monthClose?.status === "locked" ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-[color:var(--app-muted)]">
                  {dashboard.monthClose.monthKey} is locked by {dashboard.monthClose.closedByUsername}.
                </p>
                <form action={reopenMonthAction}>
                  <input type="hidden" name="monthKey" value={dashboard.monthKey} />
                  <button
                    type="submit"
                    className="rounded-md border border-[color:var(--app-border)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--app-bg)]"
                  >
                    Reopen month
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-[color:var(--app-muted)]">
                  Lock this month to finalize totals and keep a clean close history.
                </p>
                <form action={closeMonthAction}>
                  <input type="hidden" name="monthKey" value={dashboard.monthKey} />
                  <button
                    type="submit"
                    className="rounded-md bg-[color:var(--app-accent)] px-3 py-2 text-sm font-semibold text-white"
                  >
                    Close {dashboard.monthKey}
                  </button>
                </form>
              </div>
            )}
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
            <h2 className="text-base font-semibold">Anomaly + Drift Alerts</h2>
            {dashboard.anomalyAlerts.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--app-muted)]">No significant anomalies detected.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dashboard.anomalyAlerts.map((alert) => (
                  <li key={alert.id} className="rounded-md border border-[color:var(--app-border)] px-3 py-2">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-[color:var(--app-muted)]">{alert.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Prorated monthly home cost</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.totalMonthlyCostCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Cashflow due this month</p>
            <p className="font-data mt-1 text-2xl font-semibold">
              {formatCurrency(dashboard.cashflowThisMonthCostCents)}
            </p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Projected yearly home cost</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.projectedYearlyCostCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Utilities total</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.utilitiesTotalCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Upgrade spend</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.upgradesTotalCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Utility projection variance</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.utilityProjection.varianceCents)}</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              {dashboard.utilityProjection.coverageCount} categories with actual values.
            </p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Upgrade plan variance</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.upgradeProjection.varianceCents)}</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              {dashboard.upgradeProjection.coverageCount} projects with actual values.
            </p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Month close health score</p>
            <p className="font-data mt-1 text-2xl font-semibold">{dashboard.closeHealthScorePct}%</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              Blend of paid-rate, coverage, and anomaly load.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Monthly spend trend (snapshot)</h2>
            {analytics.isStale ? (
              <span className="rounded-full border border-[color:var(--app-warning)]/30 bg-[color:var(--app-warning)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--app-warning)]">
                Snapshot refreshing
              </span>
            ) : (
              <span className="rounded-full border border-[color:var(--app-success)]/30 bg-[color:var(--app-success)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--app-success)]">
                Up to date
              </span>
            )}
          </div>
          {analytics.points.length === 0 ? (
            <p className="mt-2 text-sm text-[color:var(--app-muted)]">
              Trends will appear after the first analytics snapshot is generated.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {analytics.points.slice(-4).map((point) => (
                <li
                  key={point.monthKey}
                  className="flex items-center justify-between rounded-md border border-[color:var(--app-border)] px-3 py-2"
                >
                  <span className="font-data text-sm text-[color:var(--app-muted)]">{point.monthKey}</span>
                  <span className="font-data text-sm font-semibold">{formatCurrency(point.totalMonthlyCostCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">Cashflow Calendar</h2>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-[color:var(--app-muted)]">
                Horizon
                <select
                  name="forecastWeeks"
                  defaultValue={String(forecastWeeks)}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-2 py-1 text-sm"
                >
                  <option value="4">4 weeks</option>
                  <option value="8">8 weeks</option>
                  <option value="12">12 weeks</option>
                </select>
              </label>
              <label className="flex items-center gap-1 rounded border border-[color:var(--app-border)] px-2 py-1 text-xs text-[color:var(--app-muted)]">
                <input type="checkbox" name="riskOnlyForecast" value="1" defaultChecked={riskOnlyForecast} />
                Risk weeks only
              </label>
              <button type="submit" className="rounded bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Apply
              </button>
            </form>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.cashflowForecastWeeks.map((week) => (
              <article key={week.label} className="rounded-md border border-[color:var(--app-border)] px-3 py-2">
                <p className="text-xs text-[color:var(--app-muted)]">
                  {week.label} · {week.startDate} to {week.endDate}
                </p>
                <p className="font-data text-sm font-semibold">{formatCurrency(week.totalCents)}</p>
                <p className={`text-xs ${week.isRisk ? "text-[color:var(--app-error)]" : "text-[color:var(--app-muted)]"}`}>
                  {week.dueCount} due events {week.isRisk ? "· risk week" : ""}
                </p>
              </article>
            ))}
          </div>
          {dashboard.cashflowForecastWeeks.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--app-muted)]">No risk weeks in this horizon.</p>
          ) : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Bills paid this cycle</p>
            <p className="font-data mt-1 text-2xl font-semibold">{dashboard.paidRatePct}%</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              {dashboard.paidCount} of {dashboard.bills.length} recurring bills marked paid.
            </p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 lg:col-span-2">
            <p className="text-sm text-[color:var(--app-muted)]">Top monthly cost categories</p>
            {dashboard.categoryTotals.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--app-muted)]">Add bills to unlock category analytics.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dashboard.categoryTotals.map((entry) => (
                  <li key={entry.category} className="flex items-center justify-between rounded-md border border-[color:var(--app-border)] px-3 py-2">
                    <span className="text-sm capitalize">{entry.category}</span>
                    <span className="font-data text-sm font-semibold">{formatCurrency(entry.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
            <h3 className="text-lg font-semibold">Recurring Bills</h3>
            {dashboard.bills.length === 0 ? (
              <p className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-4 py-3 text-sm text-[color:var(--app-muted)]">
                You&apos;re starting strong. Add your first recurring bill.
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.bills.map((bill) => (
                  <li key={bill.id} className="rounded-md border border-[color:var(--app-border)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{bill.name}</p>
                        <p className="font-data text-sm text-[color:var(--app-muted)]">
                          {bill.dueDate ? `Due ${bill.dueDate}` : "Not due this month"} · {bill.category}
                        </p>
                      </div>
                      <p className="font-data font-semibold">{formatCurrency(bill.amountCents)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p
                        className={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses(bill.status)}`}
                      >
                        {bill.status.replaceAll("_", " ")}
                      </p>
                      <form action={markPaidAction}>
                        <input type="hidden" name="billId" value={bill.id} />
                        <button
                          type="submit"
                          disabled={bill.isPaid}
                          className="rounded-md bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {bill.isPaid ? "Paid" : "Mark paid"}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={addBillAction}
              className="grid gap-2 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/60 p-3"
            >
              <p className="text-sm font-medium">Quick add bill</p>
              <input
                name="name"
                placeholder="Bill name"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <select
                name="category"
                defaultValue="water"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              >
                <option value="water">Water</option>
                <option value="hydro">Hydro</option>
                <option value="gas">Gas</option>
                <option value="internet">Internet</option>
                <option value="insurance">Insurance</option>
                <option value="mortgage">Mortgage</option>
                <option value="other">Other</option>
              </select>
              <input
                name="amount"
                placeholder="Amount (e.g. 145.50)"
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <select
                name="recurrenceMode"
                defaultValue="monthly_day"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              >
                <option value="monthly_day">Monthly on a fixed day</option>
                <option value="monthly_last_day">Monthly on the last day</option>
                <option value="semi_monthly">Semi-monthly on two days</option>
                <option value="yearly">Yearly (month + day)</option>
              </select>
              <input
                type="number"
                name="dueDay"
                defaultValue="15"
                min={1}
                max={31}
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <input
                type="number"
                name="secondDueDay"
                defaultValue="28"
                min={1}
                max={31}
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                placeholder="Second day (semi-monthly only)"
              />
              <input
                type="number"
                name="dueMonth"
                defaultValue="1"
                min={1}
                max={12}
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                placeholder="Due month (yearly only)"
              />
              <button
                type="submit"
                className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-105"
              >
                Save bill
              </button>
            </form>
          </div>

          <div className="space-y-4 rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
            <h3 className="text-lg font-semibold">Upgrades and Recent Activity</h3>
            {dashboard.upgrades.length === 0 ? (
              <p className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-4 py-3 text-sm text-[color:var(--app-muted)]">
                No upgrades logged yet. Add your first home upgrade.
              </p>
            ) : (
              <ul className="space-y-2">
                {dashboard.upgrades.map((upgrade) => (
                  <li
                    key={upgrade.id}
                    className="flex items-center justify-between rounded-md border border-[color:var(--app-border)] px-4 py-2"
                  >
                    <div>
                      <p className="font-medium">{upgrade.title}</p>
                      <p className="text-sm text-[color:var(--app-muted)]">{upgrade.category}</p>
                    </div>
                    <p className="font-data font-semibold">{formatCurrency(upgrade.costCents)}</p>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={addUpgradeAction}
              className="grid gap-2 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/60 p-3"
            >
              <p className="text-sm font-medium">Quick add upgrade</p>
              <input
                name="title"
                placeholder="Upgrade title"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <input
                name="category"
                placeholder="Category (safety, comfort, value-add...)"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <input
                name="cost"
                placeholder="Cost (e.g. 399.99)"
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <button
                type="submit"
                className="rounded bg-[color:var(--app-success)] px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-105"
              >
                Save upgrade
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4 sm:p-6">
          <h3 className="text-base font-semibold">Household Accountability Timeline</h3>
          {dashboard.recentActivity.length === 0 ? (
            <p className="mt-2 text-sm text-[color:var(--app-muted)]">No timeline events yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {dashboard.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-md border border-[color:var(--app-border)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{entry.summary}</p>
                    <p className="text-xs text-[color:var(--app-muted)]">
                      {entry.actorUsername} · {entry.createdAt.toISOString().slice(0, 10)}
                      {entry.monthKey ? ` · ${entry.monthKey}` : ""}
                    </p>
                  </div>
                  <span className="rounded-md bg-[color:var(--app-bg)] px-2 py-1 text-xs text-[color:var(--app-muted)]">
                    {entry.action.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
          </main>
        </div>
      </div>
    </div>
  );
}
