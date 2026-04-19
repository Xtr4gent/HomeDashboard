import Link from "next/link";
import { redirect } from "next/navigation";

import {
  deleteUtilityProjectionAction,
  logoutAction,
  saveUtilityProjectionAction,
  seedUtilityProjectionDefaultsAction,
} from "@/app/actions";
import { getSession } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/money";
import { getUtilityProjectionData, resolveProjectionMonthKey } from "@/lib/projections";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(rawMonth: string | string[] | undefined): string | undefined {
  if (typeof rawMonth === "string") {
    return rawMonth;
  }
  return undefined;
}

function toAmount(cents: number | null): string {
  if (cents === null) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

function previousMonthKey(monthKey: string): string {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export default async function ProjectionsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const monthKey = resolveProjectionMonthKey(parseMonthParam(params.month));
  const projectionData = await getUtilityProjectionData(monthKey);
  const previousMonthData = await getUtilityProjectionData(previousMonthKey(monthKey));
  const hasError = typeof params.error === "string";

  return (
    <div className="min-h-screen text-[color:var(--app-foreground)]">
      <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[color:var(--app-muted)]">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Utility Projections</h1>
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
              <Link
                href="/budget"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Budget
              </Link>
              <span className="rounded-md bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Projections
              </span>
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
            Projection action failed. Check category and amount values, then retry.
          </div>
        ) : null}

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <p className="text-sm text-[color:var(--app-muted)]">
            Monthly projections are driven by the selected month. Save planned values first, then enter actuals when bills land to track variance.
          </p>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Month
              <input
                type="month"
                name="month"
                defaultValue={projectionData.monthKey}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white"
            >
              Load month
            </button>
          </form>
          <form action={seedUtilityProjectionDefaultsAction} className="mt-3">
            <input type="hidden" name="monthKey" value={projectionData.monthKey} />
            <button
              type="submit"
              className="rounded border border-[color:var(--app-border)] px-3 py-2 text-sm font-medium text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
            >
              Create monthly projection defaults
            </button>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Planned total</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(projectionData.summary.plannedTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Actual total</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(projectionData.summary.actualTotalCents)}</p>
            <p className="mt-1 text-xs text-[color:var(--app-muted)]">
              {projectionData.summary.actualCoverageCount} categories with actual values.
            </p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Variance</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(projectionData.summary.varianceTotalCents)}</p>
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Largest overrun</p>
            {projectionData.outliers.largestOverrun ? (
              <p className="mt-1 text-sm font-medium">
                {projectionData.outliers.largestOverrun.category} ·{" "}
                <span className="font-data">{formatCurrency(projectionData.outliers.largestOverrun.varianceCents ?? 0)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[color:var(--app-muted)]">No overruns with actual data yet.</p>
            )}
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Largest underrun</p>
            {projectionData.outliers.largestUnderrun ? (
              <p className="mt-1 text-sm font-medium">
                {projectionData.outliers.largestUnderrun.category} ·{" "}
                <span className="font-data">{formatCurrency(projectionData.outliers.largestUnderrun.varianceCents ?? 0)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[color:var(--app-muted)]">No underruns with actual data yet.</p>
            )}
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Previous month planned</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(previousMonthData.summary.plannedTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Previous month actual</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(previousMonthData.summary.actualTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Previous month variance</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(previousMonthData.summary.varianceTotalCents)}</p>
          </article>
        </section>

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Monthly utility tracking</h2>
          <p className="mt-1 text-sm text-[color:var(--app-muted)]">
            Track custom utility categories for {projectionData.monthKey}. Planned and actual amounts are editable.
          </p>

          <div className="mt-4 space-y-3">
            {projectionData.rows.map((row) => (
              <div key={row.id} className="rounded-md border border-[color:var(--app-border)] p-3">
                <form action={saveUtilityProjectionAction} className="grid gap-2 sm:grid-cols-5 sm:items-end">
                  <input type="hidden" name="monthKey" value={projectionData.monthKey} />
                  <label className="grid gap-1 text-sm">
                    Category
                    <input
                      name="category"
                      defaultValue={row.category}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Planned
                    <input
                      name="planned"
                      defaultValue={toAmount(row.plannedCents)}
                      className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Actual
                    <input
                      name="actual"
                      defaultValue={toAmount(row.actualCents)}
                      className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <div className="text-sm">
                    <p className="text-[color:var(--app-muted)]">Variance</p>
                    <p className="font-data font-semibold">
                      {row.varianceCents === null ? "Pending actual" : formatCurrency(row.varianceCents)}
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white"
                  >
                    Save
                  </button>
                </form>
                <form action={deleteUtilityProjectionAction} className="mt-2">
                  <input type="hidden" name="projectionId" value={row.id} />
                  <button
                    type="submit"
                    className="rounded border border-[color:var(--app-border)] px-3 py-2 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
                  >
                    Remove category
                  </button>
                </form>
              </div>
            ))}
          </div>

          <form action={saveUtilityProjectionAction} className="mt-4 grid gap-2 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/60 p-3 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="monthKey" value={projectionData.monthKey} />
            <label className="grid gap-1 text-sm">
              New category
              <input
                name="category"
                placeholder="hydro, gas, water..."
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Planned amount
              <input
                name="planned"
                placeholder="0.00"
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Actual amount (optional)
              <input
                name="actual"
                placeholder="0.00"
                className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-success)] px-3 py-2 text-sm font-medium text-white"
            >
              Add / update category
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
