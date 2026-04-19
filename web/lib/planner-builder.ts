import {
  projectFinancedItem,
  projectOneTimeItem,
  projectRecurringItem,
  type ScenarioProjectionItem,
} from "@/lib/planner-math";
import type { PlannerInput } from "@/lib/planner-schema";
import { toCents } from "@/lib/money";
import { buildRecurrenceRule } from "@/lib/time";

function toBps(annualRatePct: number): number {
  return Math.round(annualRatePct * 100);
}

export function buildScenarioProjectionItems(input: PlannerInput): ScenarioProjectionItem[] {
  const recurrenceRule = buildRecurrenceRule(input.recurrenceMode, {
    dueDay: input.dueDay,
    secondDueDay: input.secondDueDay,
    dueMonth: input.dueMonth,
  });

  const recurringItems: ScenarioProjectionItem[] = [
    {
      kind: "recurring",
      label: "Property Tax",
      category: "tax",
      recurrenceRule,
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.propertyTaxMonthly, { allowZero: true }) }),
    },
    {
      kind: "recurring",
      label: "Insurance",
      category: "insurance",
      recurrenceRule,
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.insuranceMonthly, { allowZero: true }) }),
    },
    {
      kind: "recurring",
      label: "Utilities",
      category: "utility",
      recurrenceRule,
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.utilitiesMonthly, { allowZero: true }) }),
    },
    {
      kind: "recurring",
      label: "Other Monthly",
      category: "other",
      recurrenceRule,
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.otherMonthly, { allowZero: true }) }),
    },
  ];

  const financedItems: ScenarioProjectionItem[] = [
    {
      kind: "financed",
      label: "Mortgage",
      category: "mortgage",
      recurrenceRule,
      principalCents: toCents(input.mortgagePrincipal, { allowZero: true }),
      annualRateBps: toBps(input.mortgageRateAnnualPct),
      termMonths: input.mortgageTermMonths,
      ...projectFinancedItem({
        principalCents: toCents(input.mortgagePrincipal, { allowZero: true }),
        annualRateBps: toBps(input.mortgageRateAnnualPct),
        termMonths: input.mortgageTermMonths,
      }),
    },
  ];

  if (input.upgradeOneTimeCost > 0) {
    financedItems.push({
      kind: "financed",
      label: "Upgrade Financing",
      category: "upgrade",
        recurrenceRule,
      principalCents: toCents(input.upgradeOneTimeCost, { allowZero: true }),
      annualRateBps: toBps(input.upgradeRateAnnualPct),
      termMonths: input.upgradeSpreadMonths,
      ...projectFinancedItem({
        principalCents: toCents(input.upgradeOneTimeCost, { allowZero: true }),
        annualRateBps: toBps(input.upgradeRateAnnualPct),
        termMonths: input.upgradeSpreadMonths,
      }),
    });
  }

  const oneTimeItems: ScenarioProjectionItem[] = input.upgradeOneTimeCost > 0
    ? [
        {
          kind: "one_time",
          label: "Upgrade Principal",
          category: "upgrade",
          ...projectOneTimeItem(toCents(input.upgradeOneTimeCost, { allowZero: true })),
        },
      ]
    : [];

  return [...recurringItems, ...financedItems, ...oneTimeItems];
}
