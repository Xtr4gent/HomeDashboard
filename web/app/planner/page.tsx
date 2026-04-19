import Link from "next/link";
import { redirect } from "next/navigation";

import { applyScenarioAction, logoutAction, saveScenarioAction } from "@/app/actions";
import { getSession } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { type RecurrenceMode, parseRecurrenceRule } from "@/lib/time";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PlannerFormDefaults = {
  scenarioId?: string;
  expectedVersion?: number;
  name: string;
  notes: string;
  mortgagePrincipal: string;
  mortgageRateAnnualPct: string;
  mortgageTermMonths: string;
  propertyTaxMonthly: string;
  insuranceMonthly: string;
  utilitiesMonthly: string;
  otherMonthly: string;
  upgradeOneTimeCost: string;
  upgradeSpreadMonths: string;
  upgradeRateAnnualPct: string;
  recurrenceMode: RecurrenceMode;
  dueDay: string;
  secondDueDay: string;
  dueMonth: string;
};

type ScenarioDraft = {
  id: string;
  version: number;
  name: string;
  notes: string | null;
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  recurringMonthlyCents: number;
  financedMonthlyCents: number;
  items: {
    label: string;
    category: string;
    amountCents: number;
    annualRateBps: number | null;
    termMonths: number | null;
    recurrenceRule: string | null;
  }[];
};

function asAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function defaultsFromScenario(scenario: ScenarioDraft | null): PlannerFormDefaults {
  if (!scenario) {
    return {
      name: "New House Plan",
      notes: "",
      mortgagePrincipal: "350000",
      mortgageRateAnnualPct: "5.20",
      mortgageTermMonths: "300",
      propertyTaxMonthly: "350",
      insuranceMonthly: "120",
      utilitiesMonthly: "250",
      otherMonthly: "150",
      upgradeOneTimeCost: "0",
      upgradeSpreadMonths: "60",
      upgradeRateAnnualPct: "6.50",
      recurrenceMode: "monthly_day",
      dueDay: "15",
      secondDueDay: "28",
      dueMonth: "1",
    };
  }

  const mortgage = scenario.items.find((item) => item.label === "Mortgage");
  const upgrade = scenario.items.find((item) => item.label === "Upgrade Financing");
  const tax = scenario.items.find((item) => item.label === "Property Tax");
  const insurance = scenario.items.find((item) => item.label === "Insurance");
  const utilities = scenario.items.find((item) => item.label === "Utilities");
  const other = scenario.items.find((item) => item.label === "Other Monthly");
  const recurrenceSource = scenario.items.find((item) => item.recurrenceRule) ?? null;
  let recurrenceMode: RecurrenceMode = "monthly_day";
  let dueDay = "15";
  let secondDueDay = "28";
  let dueMonth = "1";

  if (recurrenceSource?.recurrenceRule) {
    try {
      const parsedRecurrence = parseRecurrenceRule(recurrenceSource.recurrenceRule);
      if (parsedRecurrence.kind === "monthly_last_day") {
        recurrenceMode = "monthly_last_day";
      }
      if (parsedRecurrence.kind === "monthly_day") {
        recurrenceMode = "monthly_day";
        dueDay = String(parsedRecurrence.day);
      }
      if (parsedRecurrence.kind === "semi_monthly") {
        recurrenceMode = "semi_monthly";
        dueDay = String(parsedRecurrence.firstDay);
        secondDueDay = String(parsedRecurrence.secondDay);
      }
      if (parsedRecurrence.kind === "yearly") {
        recurrenceMode = "yearly";
        dueDay = String(parsedRecurrence.day);
        dueMonth = String(parsedRecurrence.month);
      }
    } catch {
      // Keep defaults when older/invalid recurrence values are encountered.
    }
  }

  return {
    scenarioId: scenario.id,
    expectedVersion: scenario.version,
    name: scenario.name,
    notes: scenario.notes ?? "",
    mortgagePrincipal: mortgage ? asAmount(mortgage.amountCents) : "350000",
    mortgageRateAnnualPct: mortgage?.annualRateBps ? (mortgage.annualRateBps / 100).toFixed(2) : "5.20",
    mortgageTermMonths: String(mortgage?.termMonths ?? 300),
    propertyTaxMonthly: tax ? asAmount(tax.amountCents) : "350",
    insuranceMonthly: insurance ? asAmount(insurance.amountCents) : "120",
    utilitiesMonthly: utilities ? asAmount(utilities.amountCents) : "250",
    otherMonthly: other ? asAmount(other.amountCents) : "150",
    upgradeOneTimeCost: upgrade ? asAmount(upgrade.amountCents) : "0",
    upgradeSpreadMonths: String(upgrade?.termMonths ?? 60),
    upgradeRateAnnualPct: upgrade?.annualRateBps ? (upgrade.annualRateBps / 100).toFixed(2) : "6.50",
    recurrenceMode,
    dueDay,
    secondDueDay,
    dueMonth,
  };
}

export default async function PlannerPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const selectedScenarioId = typeof params.scenarioId === "string" ? params.scenarioId : undefined;
  const compareIds =
    typeof params.compare === "string"
      ? params.compare
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

  const scenarios: ScenarioDraft[] = await prisma.scenario.findMany({
    where: { status: "draft" },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  const selectedScenario = selectedScenarioId
    ? scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null
    : scenarios[0] ?? null;

  const compareScenarios = scenarios.filter((scenario) => compareIds.includes(scenario.id));
  const defaults = defaultsFromScenario(selectedScenario);

  return (
    <div className="min-h-screen text-[color:var(--app-foreground)]">
      <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm text-[color:var(--app-muted)]">HomeDashboard</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Planner Lab</h1>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/"
                className="rounded-md border border-[color:var(--app-border)] px-3 py-1 text-xs font-semibold text-[color:var(--app-muted)] hover:bg-[color:var(--app-bg)]"
              >
                Dashboard
              </Link>
              <span className="rounded-md bg-[color:var(--app-accent)] px-3 py-1 text-xs font-semibold text-white">
                Planner Lab
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
        {params.error ? (
          <div className="rounded-md border border-[color:var(--app-error)]/25 bg-[color:var(--app-error)]/10 px-4 py-3 text-sm text-[color:var(--app-error)]">
            Planner action failed. Check values and try again.
          </div>
        ) : null}
        {params.success ? (
          <div className="rounded-md border border-[color:var(--app-success)]/25 bg-[color:var(--app-success)]/10 px-4 py-3 text-sm text-[color:var(--app-success)]">
            Planner action completed successfully.
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-3">
          <form
            action={saveScenarioAction}
            className="space-y-4 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 lg:col-span-2 sm:p-6"
          >
            <h2 className="text-lg font-semibold">Scenario Builder</h2>
            <input type="hidden" name="scenarioId" value={defaults.scenarioId ?? ""} />
            <input type="hidden" name="expectedVersion" value={defaults.expectedVersion ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Scenario name
                <input
                  name="name"
                  defaultValue={defaults.name}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Notes
                <input
                  name="notes"
                  defaultValue={defaults.notes}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Mortgage principal
                <input name="mortgagePrincipal" defaultValue={defaults.mortgagePrincipal} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Mortgage annual rate %
                <input name="mortgageRateAnnualPct" defaultValue={defaults.mortgageRateAnnualPct} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Mortgage term (months)
                <input name="mortgageTermMonths" defaultValue={defaults.mortgageTermMonths} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Property tax monthly
                <input name="propertyTaxMonthly" defaultValue={defaults.propertyTaxMonthly} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Insurance monthly
                <input name="insuranceMonthly" defaultValue={defaults.insuranceMonthly} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Utilities monthly
                <input name="utilitiesMonthly" defaultValue={defaults.utilitiesMonthly} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Other monthly
                <input name="otherMonthly" defaultValue={defaults.otherMonthly} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Upgrade one-time cost
                <input name="upgradeOneTimeCost" defaultValue={defaults.upgradeOneTimeCost} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Upgrade spread months
                <input name="upgradeSpreadMonths" defaultValue={defaults.upgradeSpreadMonths} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Upgrade annual rate %
                <input name="upgradeRateAnnualPct" defaultValue={defaults.upgradeRateAnnualPct} className="font-data rounded border border-[color:var(--app-border)] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                Recurrence mode
                <select
                  name="recurrenceMode"
                  defaultValue={defaults.recurrenceMode}
                  className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2"
                >
                  <option value="monthly_day">Monthly on fixed day</option>
                  <option value="monthly_last_day">Monthly on last day</option>
                  <option value="semi_monthly">Semi-monthly on two days</option>
                  <option value="yearly">Yearly (month + day)</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Due day
                <input
                  name="dueDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={defaults.dueDay}
                  className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Second due day (semi-monthly)
                <input
                  name="secondDueDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={defaults.secondDueDay}
                  className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Due month (yearly)
                <input
                  name="dueMonth"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={defaults.dueMonth}
                  className="font-data rounded border border-[color:var(--app-border)] px-3 py-2"
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded bg-[color:var(--app-accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Save draft scenario
            </button>
          </form>

          <aside className="space-y-3 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
            <h3 className="text-base font-semibold">Drafts to Compare</h3>
            {scenarios.length === 0 ? (
              <p className="text-sm text-[color:var(--app-muted)]">No scenarios yet. Save one to start comparing options.</p>
            ) : (
              <ul className="space-y-3">
                {scenarios.map((scenario) => (
                  <li key={scenario.id} className="rounded-md border border-[color:var(--app-border)] p-3">
                    <p className="font-medium">{scenario.name}</p>
                    <p className="font-data text-xs text-[color:var(--app-muted)]">
                      Monthly {formatCurrency(scenario.monthlyTotalCents)} · Yearly {formatCurrency(scenario.yearlyTotalCents)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/planner?scenarioId=${scenario.id}`}
                        className="rounded border border-[color:var(--app-border)] px-2 py-1 text-xs font-semibold text-[color:var(--app-muted)]"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/planner?compare=${encodeURIComponent([scenario.id, ...compareIds].slice(0, 5).join(","))}`}
                        className="rounded border border-[color:var(--app-border)] px-2 py-1 text-xs font-semibold text-[color:var(--app-muted)]"
                      >
                        Compare
                      </Link>
                      <form action={applyScenarioAction}>
                        <input type="hidden" name="scenarioId" value={scenario.id} />
                        <input type="hidden" name="expectedVersion" value={scenario.version} />
                        <button
                          type="submit"
                          className="rounded bg-[color:var(--app-success)] px-2 py-1 text-xs font-semibold text-white"
                        >
                          Apply to dashboard
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </section>

        <section className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4 sm:p-6">
          <h3 className="text-base font-semibold">Scenario comparison</h3>
          {compareScenarios.length === 0 ? (
            <p className="mt-2 text-sm text-[color:var(--app-muted)]">
              Add scenarios to compare. You can compare up to 5 drafts at once.
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {compareScenarios.map((scenario) => (
                <article key={scenario.id} className="rounded-md border border-[color:var(--app-border)] p-3">
                  <p className="font-medium">{scenario.name}</p>
                  <p className="font-data mt-1 text-sm">
                    Monthly {formatCurrency(scenario.monthlyTotalCents)}
                  </p>
                  <p className="font-data text-sm">Yearly {formatCurrency(scenario.yearlyTotalCents)}</p>
                  <p className="font-data text-xs text-[color:var(--app-muted)]">
                    Recurring {formatCurrency(scenario.recurringMonthlyCents)} · Financed{" "}
                    {formatCurrency(scenario.financedMonthlyCents)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
