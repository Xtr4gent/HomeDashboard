import { toCents } from "@/lib/money";
import {
  projectFinancedItem,
  projectOneTimeItem,
  projectRecurringItem,
  type ScenarioProjectionItem,
} from "@/lib/planner-math";
import type { PlannerInput } from "@/lib/planner-schema";

function toBps(annualRatePct: number): number {
  return Math.round(annualRatePct * 100);
}

export function buildScenarioProjectionItems(input: PlannerInput): ScenarioProjectionItem[] {
  const recurringItems: ScenarioProjectionItem[] = [
    {
      kind: "recurring",
      label: "Property Tax",
      category: "tax",
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.propertyTaxMonthly) }),
    },
    {
      kind: "recurring",
      label: "Insurance",
      category: "insurance",
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.insuranceMonthly) }),
    },
    {
      kind: "recurring",
      label: "Utilities",
      category: "utility",
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.utilitiesMonthly) }),
    },
    {
      kind: "recurring",
      label: "Other Monthly",
      category: "other",
      ...projectRecurringItem({ monthlyAmountCents: toCents(input.otherMonthly) }),
    },
  ];

  const financedItems: ScenarioProjectionItem[] = [
    {
      kind: "financed",
      label: "Mortgage",
      category: "mortgage",
      principalCents: toCents(input.mortgagePrincipal),
      annualRateBps: toBps(input.mortgageRateAnnualPct),
      termMonths: input.mortgageTermMonths,
      ...projectFinancedItem({
        principalCents: toCents(input.mortgagePrincipal),
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
      principalCents: toCents(input.upgradeOneTimeCost),
      annualRateBps: toBps(input.upgradeRateAnnualPct),
      termMonths: input.upgradeSpreadMonths,
      ...projectFinancedItem({
        principalCents: toCents(input.upgradeOneTimeCost),
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
          ...projectOneTimeItem(toCents(input.upgradeOneTimeCost)),
        },
      ]
    : [];

  return [...recurringItems, ...financedItems, ...oneTimeItems];
}
