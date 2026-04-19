import Link from "next/link";
import { redirect } from "next/navigation";

import {
  deleteUpgradeProjectAction,
  logoutAction,
  saveUpgradeActualMonthAction,
  saveUpgradePlannedMonthAction,
  saveUpgradeProjectAction,
} from "@/app/actions";
import { getSession } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/money";
import { resolveProjectionMonthKey } from "@/lib/projections";
import { filterUpgradeProjects, getUpgradePlannerData } from "@/lib/upgrades";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(rawMonth: string | string[] | undefined): string | undefined {
  if (typeof rawMonth === "string") {
    return rawMonth;
  }
  return undefined;
}

function parseViewParam(rawView: string | string[] | undefined): "all" | "active" | "overdue" | "completed" {
  if (rawView === "active" || rawView === "overdue" || rawView === "completed") {
    return rawView;
  }
  return "all";
}

function toAmount(cents: number | null): string {
  if (cents === null) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

export default async function UpgradesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const monthKey = resolveProjectionMonthKey(parseMonthParam(params.month));
  const view = parseViewParam(params.view);
  const upgradesData = await getUpgradePlannerData(monthKey);
  const visibleProjects = filterUpgradeProjects(upgradesData.projects, view);
  const hasError = typeof params.error === "string";

  return (
    <div className="min-h-screen text-[color:var(--app-foreground)]">
      <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[color:var(--app-muted)]">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Home Upgrades</h1>
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
                href="/projections"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Projections
              </Link>
              <span className="rounded-md bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Upgrades
              </span>
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
            Upgrade action failed. Check values and retry.
          </div>
        ) : null}

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Month
              <input
                type="month"
                name="month"
                defaultValue={upgradesData.monthKey}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              View
              <select
                name="view"
                defaultValue={view}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              >
                <option value="all">All projects</option>
                <option value="active">Active only</option>
                <option value="overdue">Overdue target</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white"
            >
              Load month
            </button>
          </form>
          <p className="mt-2 text-sm text-[color:var(--app-muted)]">
            Plan and track upgrades in parallel: monthly planned spread on one side, monthly actual cash on the other.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Month planned</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(upgradesData.monthSummary.plannedTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Month actual</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(upgradesData.monthSummary.actualTotalCents)}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Month variance</p>
            <p className="font-data mt-1 text-2xl font-semibold">{formatCurrency(upgradesData.monthSummary.varianceTotalCents)}</p>
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Active projects</p>
            <p className="font-data mt-1 text-2xl font-semibold">{upgradesData.activeCount}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Overdue targets</p>
            <p className="font-data mt-1 text-2xl font-semibold">{upgradesData.overdueCount}</p>
          </article>
          <article className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
            <p className="text-sm text-[color:var(--app-muted)]">Completed projects</p>
            <p className="font-data mt-1 text-2xl font-semibold">{upgradesData.completedCount}</p>
          </article>
        </section>

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Upgrade roadmap and monthly ledger</h2>
          <p className="mt-1 text-sm text-[color:var(--app-muted)]">
            Edit project metadata, then set planned and actual values for {upgradesData.monthKey}.
          </p>

          <div className="mt-4 space-y-3">
            {visibleProjects.map((project) => (
              <article key={project.id} className="rounded-md border border-[color:var(--app-border)] p-3">
                <form action={saveUpgradeProjectAction} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="projectId" value={project.id} />
                  <label className="grid gap-1 text-sm">
                    Title
                    <input
                      name="title"
                      defaultValue={project.title}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Category
                    <input
                      name="category"
                      defaultValue={project.category}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Status
                    <select
                      name="status"
                      defaultValue={project.status}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    >
                      <option value="planned">planned</option>
                      <option value="in_progress">in progress</option>
                      <option value="completed">completed</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Start month
                    <input
                      type="month"
                      name="startMonthKey"
                      defaultValue={project.startMonthKey}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Target month
                    <input
                      type="month"
                      name="targetMonthKey"
                      defaultValue={project.targetMonthKey}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-3">
                    Notes
                    <input
                      name="notes"
                      defaultValue={project.notes ?? ""}
                      className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded bg-[color:var(--app-accent)] px-3 py-2 text-sm font-medium text-white"
                  >
                    Save project
                  </button>
                </form>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <form action={saveUpgradePlannedMonthAction} className="grid gap-1 rounded-md border border-[color:var(--app-border)] p-3">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="monthKey" value={upgradesData.monthKey} />
                    <label className="grid gap-1 text-sm">
                      Planned for {upgradesData.monthKey}
                      <input
                        name="planned"
                        defaultValue={toAmount(project.monthPlannedCents)}
                        className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded border border-[color:var(--app-border)] px-3 py-2 text-sm font-medium text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
                    >
                      Save planned
                    </button>
                  </form>

                  <form action={saveUpgradeActualMonthAction} className="grid gap-1 rounded-md border border-[color:var(--app-border)] p-3">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="monthKey" value={upgradesData.monthKey} />
                    <label className="grid gap-1 text-sm">
                      Actual for {upgradesData.monthKey}
                      <input
                        name="actual"
                        defaultValue={toAmount(project.monthActualCents)}
                        className="font-data rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded border border-[color:var(--app-border)] px-3 py-2 text-sm font-medium text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
                    >
                      Save actual
                    </button>
                  </form>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[color:var(--app-muted)]">
                    Month variance:{" "}
                    <span className="font-data font-semibold text-[color:var(--app-foreground)]">
                      {project.monthVarianceCents === null ? "Pending actual" : formatCurrency(project.monthVarianceCents)}
                    </span>{" "}
                    · Project total:{" "}
                    <span className="font-data font-semibold text-[color:var(--app-foreground)]">
                      {formatCurrency(project.actualTotalCents)} / {formatCurrency(project.plannedTotalCents)}
                    </span>
                  </p>
                  {project.isOverdueTarget ? (
                    <span className="rounded-full border border-[color:var(--app-error)]/30 bg-[color:var(--app-error)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--app-error)]">
                      Target overdue
                    </span>
                  ) : null}
                  <form action={deleteUpgradeProjectAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      className="rounded border border-[color:var(--app-border)] px-3 py-2 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
                    >
                      Delete project
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>

          <form action={saveUpgradeProjectAction} className="mt-4 grid gap-2 rounded-md border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/60 p-3 sm:grid-cols-3 sm:items-end">
            <label className="grid gap-1 text-sm">
              New project title
              <input
                name="title"
                placeholder="Basement insulation"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Category
              <input
                name="category"
                placeholder="efficiency, safety..."
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Status
              <select
                name="status"
                defaultValue="planned"
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              >
                <option value="planned">planned</option>
                <option value="in_progress">in progress</option>
                <option value="completed">completed</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Start month
              <input
                type="month"
                name="startMonthKey"
                defaultValue={upgradesData.monthKey}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Target month
              <input
                type="month"
                name="targetMonthKey"
                defaultValue={upgradesData.monthKey}
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-3">
              Notes
              <input
                name="notes"
                placeholder="Optional notes..."
                className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-success)] px-3 py-2 text-sm font-medium text-white"
            >
              Add project
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
