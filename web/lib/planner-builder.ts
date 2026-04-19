import {
  projectFinancedItem,
  projectOneTimeItem,
  projectRecurringItem,
  type ScenarioProjectionItem,
} from "@/lib/planner-math";
import type { PlannerInput } from "@/lib/planner-schema";

function toPlannerCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be zero or greater.");
  }

  return Math.round(amount * 100);
}

function toBps(annualRatePct: number): number {
  return Math.round(annualRatePct * 100);
}

export function buildScenarioProjectionItems(input: PlannerInput): ScenarioProjectionItem[] {
  const recurringItems: ScenarioProjectionItem[] = [
    {
      kind: "recurring",
      label: "Property Tax",
      category: "tax",
      ...projectRecurringItem({ monthlyAmountCents: toPlannerCents(input.propertyTaxMonthly) }),
    },
    {
      kind: "recurring",
      label: "Insurance",
      category: "insurance",
      ...projectRecurringItem({ monthlyAmountCents: toPlannerCents(input.insuranceMonthly) }),
    },
    {
      kind: "recurring",
      label: "Utilities",
      category: "utility",
      ...projectRecurringItem({ monthlyAmountCents: toPlannerCents(input.utilitiesMonthly) }),
    },
    {
      kind: "recurring",
      label: "Other Monthly",
      category: "other",
      ...projectRecurringItem({ monthlyAmountCents: toPlannerCents(input.otherMonthly) }),
    },
  ];

  const financedItems: ScenarioProjectionItem[] = [
    {
      kind: "financed",
      label: "Mortgage",
      category: "mortgage",
      principalCents: toPlannerCents(input.mortgagePrincipal),
      annualRateBps: toBps(input.mortgageRateAnnualPct),
      termMonths: input.mortgageTermMonths,
      ...projectFinancedItem({
        principalCents: toPlannerCents(input.mortgagePrincipal),
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
      principalCents: toPlannerCents(input.upgradeOneTimeCost),
      annualRateBps: toBps(input.upgradeRateAnnualPct),
      termMonths: input.upgradeSpreadMonths,
      ...projectFinancedItem({
        principalCents: toPlannerCents(input.upgradeOneTimeCost),
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
          ...projectOneTimeItem(toPlannerCents(input.upgradeOneTimeCost)),
        },
      ]
    : [];

  return [...recurringItems, ...financedItems, ...oneTimeItems];
}
