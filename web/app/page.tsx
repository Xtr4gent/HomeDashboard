import { redirect } from "next/navigation";
import Link from "next/link";

import {
  addBillAction,
  addUpgradeAction,
  logoutAction,
  markPaidAction,
} from "@/app/actions";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/money";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  return "border-[color:var(--app-info)]/20 bg-[color:var(--app-info)]/12 text-[color:var(--app-info)]";
}

export default async function Home({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const dashboard = await getDashboardData();

  return (
    <div className="min-h-screen text-[color:var(--app-foreground)]">
      <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[color:var(--app-muted)]">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">House Ops Command Center</h1>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Dashboard
              </span>
              <Link
                href="/planner"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Planner Lab
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
        {params.error ? (
          <div className="rounded-md border border-[color:var(--app-error)]/25 bg-[color:var(--app-error)]/10 px-4 py-3 text-sm text-[color:var(--app-error)]">
            Something went wrong with that action. Please review the input and try again.
          </div>
        ) : null}

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 shadow-[0_8px_24px_rgba(31,36,48,0.08)] sm:p-6">
          <h2 className="text-lg font-semibold">Urgent Actions</h2>
          <p className="mt-1 text-sm text-[color:var(--app-muted)]">
            Overdue: {dashboard.overdueCount} · Due soon: {dashboard.dueSoonCount} · Unpaid this month:{" "}
            {dashboard.unpaidCount}
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Total monthly home cost</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.totalMonthlyCostCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Projected yearly home cost</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.projectedYearlyCostCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Utilities total</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.utilitiesTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Upgrade spend</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(dashboard.upgradesTotalCents)}</p>
          </article>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Bills paid this cycle</p>
            <p className="font-data mt-1 text-2xl font-semibold">{dashboard.paidRatePct}%</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              {dashboard.paidCount} of {dashboard.bills.length} recurring bills marked paid.
            </p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 lg:col-span-2">
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
          <div className="space-y-4 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
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
                          Due {bill.dueDate} · {bill.category}
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
              </select>
              <input
                type="number"
                name="dueDay"
                defaultValue="15"
                min={1}
                max={31}
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
              <button
                type="submit"
                className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-105"
              >
                Save bill
              </button>
            </form>
          </div>

          <div className="space-y-4 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
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
      </main>
    </div>
  );
}
