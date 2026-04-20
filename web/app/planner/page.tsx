import { redirect } from "next/navigation";

import { saveHomeProfileSnapshotAction } from "@/app/actions";
import { AppShell } from "@/app/components/app-shell";
import { getSession } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/money";
import {
  deriveMortgageTermEndMonthKey,
  getHomeProfileSnapshotView,
} from "@/lib/our-home";
import { resolveProjectionMonthKey } from "@/lib/projections";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(rawMonth: string | string[] | undefined): string | undefined {
  if (typeof rawMonth === "string") {
    return rawMonth;
  }
  return undefined;
}

export default async function PlannerPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const monthKey = resolveProjectionMonthKey(parseMonthParam(params.month));
  const snapshot = await getHomeProfileSnapshotView(monthKey);
  const successCode = typeof params.success === "string" ? params.success : undefined;
  const hasError = typeof params.error === "string";

  return (
    <AppShell title="Our Home" username={session.username} activeNav="planner">
      <main className="flex w-full min-w-0 flex-col gap-6">
        {hasError ? (
          <div className="rounded-md border border-[color:var(--app-error)]/25 bg-[color:var(--app-error)]/10 px-4 py-3 text-sm text-[color:var(--app-error)]">
            Could not save Our Home details. Check your entries and try again.
          </div>
        ) : null}
        {successCode === "home_profile_saved" ? (
          <div className="rounded-md border border-[color:var(--app-success)]/25 bg-[color:var(--app-success)]/10 px-4 py-3 text-sm text-[color:var(--app-success)]">
            Our Home snapshot saved successfully.
          </div>
        ) : null}

        <section className="rounded-2xl border border-[color:var(--app-border)] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--app-muted)]">Our Home</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Home Financial Snapshot</h1>
          <p className="mt-2 text-sm text-[color:var(--app-muted)]">
            Store the core details for your home by month, mortgage, taxes, and utilities all in one place.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Monthly mortgage</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(snapshot.monthlyMortgagePaymentCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Monthly property tax</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(snapshot.monthlyPropertyTaxCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Monthly utilities</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(snapshot.monthlyUtilitiesTotalCents)}</p>
          </article>
          <article className="rounded-2xl border border-[color:var(--app-border)] bg-white p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Housing core total</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(snapshot.monthlyHousingCoreCents)}</p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <form
            id="our-home-form"
            action={saveHomeProfileSnapshotAction}
            className="space-y-4 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6"
          >
            <h2 className="text-lg font-semibold">Our Home Details</h2>
            <section className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Snapshot month
                <input
                  type="month"
                  name="monthKey"
                  defaultValue={snapshot.values.monthKey}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Property address
                <input
                  name="propertyAddress"
                  defaultValue={snapshot.values.propertyAddress}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Mortgage payment (semi-monthly)
                <input name="semiMonthlyPayment" defaultValue={snapshot.values.semiMonthlyPayment} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Mortgage annual rate %
                <input name="mortgageInterestRatePct" defaultValue={snapshot.values.mortgageInterestRatePct} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Current term (years)
                <input name="mortgageTermYears" defaultValue={snapshot.values.mortgageTermYears} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Term start month
                <input
                  type="month"
                  name="mortgageTermStartMonthKey"
                  defaultValue={snapshot.values.mortgageTermStartMonthKey}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Term end month (auto)
                <input
                  value={deriveMortgageTermEndMonthKey(snapshot.values.mortgageTermStartMonthKey, Number(snapshot.values.mortgageTermYears))}
                  readOnly
                  className="rounded border border-[color:var(--app-border)] bg-slate-100 px-3 py-2 text-slate-600"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Lender (optional)
                <input name="mortgageLender" defaultValue={snapshot.values.mortgageLender} className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                Mortgage notes (optional)
                <textarea
                  name="mortgageNotes"
                  defaultValue={snapshot.values.mortgageNotes}
                  rows={3}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
            </section>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Save Our Home snapshot
            </button>
          </form>

          <aside className="space-y-3 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h3 className="text-base font-semibold">Property taxes and utilities</h3>
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Property tax (yearly total)
                <input
                  form="our-home-form"
                  name="propertyTaxYearly"
                  defaultValue={snapshot.values.propertyTaxYearly}
                  className="font-data rounded border border-[color:var(--app-border)] bg-white px-3 py-2"
                />
              </label>
              <p className="text-sm text-[color:var(--app-muted)]">
                Monthly property tax equivalent:{" "}
                <span className="font-data font-semibold text-slate-900">{formatCurrency(snapshot.monthlyPropertyTaxCents)}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  Water (monthly)
                  <input
                    form="our-home-form"
                    name="waterMonthly"
                    defaultValue={snapshot.values.waterMonthly}
                    className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Gas (monthly)
                  <input
                    form="our-home-form"
                    name="gasMonthly"
                    defaultValue={snapshot.values.gasMonthly}
                    className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Hydro (monthly)
                  <input
                    form="our-home-form"
                    name="hydroMonthly"
                    defaultValue={snapshot.values.hydroMonthly}
                    className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                  />
                </label>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
