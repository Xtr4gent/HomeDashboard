type FinancedProjectionInput = {
  principalCents: number;
  annualRateBps: number;
  termMonths: number;
};

type RecurringProjectionInput = {
  monthlyAmountCents: number;
};

export type ScenarioProjectionItem =
  | {
      kind: "recurring";
      label: string;
      category: string;
      recurrenceRule: string;
      monthlyCents: number;
      yearlyCents: number;
    }
  | {
      kind: "financed";
      label: string;
      category: string;
      recurrenceRule: string;
      principalCents: number;
      annualRateBps: number;
      termMonths: number;
      monthlyCents: number;
      yearlyCents: number;
      totalPaidCents: number;
      interestPaidCents: number;
    }
  | {
      kind: "one_time";
      label: string;
      category: string;
      oneTimeCents: number;
      monthlyEquivalentCents: number;
      yearlyCents: number;
    };

export type ScenarioTotals = {
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  recurringMonthlyCents: number;
  financedMonthlyCents: number;
  oneTimeCents: number;
};

function roundToCents(value: number): number {
  return Math.round(value);
}

export function projectRecurringItem(input: RecurringProjectionInput): {
  monthlyCents: number;
  yearlyCents: number;
} {
  if (!Number.isInteger(input.monthlyAmountCents) || input.monthlyAmountCents < 0) {
    throw new Error("Recurring monthly amount must be a non-negative cent value.");
  }

  return {
    monthlyCents: input.monthlyAmountCents,
    yearlyCents: input.monthlyAmountCents * 12,
  };
}

export function projectFinancedItem(input: FinancedProjectionInput): {
  monthlyCents: number;
  yearlyCents: number;
  totalPaidCents: number;
  interestPaidCents: number;
} {
  const { principalCents, annualRateBps, termMonths } = input;

  if (!Number.isInteger(principalCents) || principalCents < 0) {
    throw new Error("Principal must be a non-negative cent value.");
  }
  if (!Number.isInteger(annualRateBps) || annualRateBps < 0) {
    throw new Error("Annual rate must be a non-negative basis-points value.");
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error("Term must be a positive month value.");
  }
  if (principalCents === 0) {
    return {
      monthlyCents: 0,
      yearlyCents: 0,
      totalPaidCents: 0,
      interestPaidCents: 0,
    };
  }

  const monthlyRate = annualRateBps / 10000 / 12;

  if (monthlyRate === 0) {
    const monthlyCents = roundToCents(principalCents / termMonths);
    const totalPaidCents = monthlyCents * termMonths;
    return {
      monthlyCents,
      yearlyCents: monthlyCents * 12,
      totalPaidCents,
      interestPaidCents: Math.max(totalPaidCents - principalCents, 0),
    };
  }

  const payment =
    (principalCents * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  const monthlyCents = roundToCents(payment);
  const totalPaidCents = monthlyCents * termMonths;
  return {
    monthlyCents,
    yearlyCents: monthlyCents * 12,
    totalPaidCents,
    interestPaidCents: Math.max(totalPaidCents - principalCents, 0),
  };
}

export function projectOneTimeItem(oneTimeCents: number): {
  oneTimeCents: number;
  monthlyEquivalentCents: number;
  yearlyCents: number;
} {
  if (!Number.isInteger(oneTimeCents) || oneTimeCents < 0) {
    throw new Error("One-time amount must be a non-negative cent value.");
  }
  const monthlyEquivalentCents = roundToCents(oneTimeCents / 12);
  return {
    oneTimeCents,
    monthlyEquivalentCents,
    yearlyCents: oneTimeCents,
  };
}

export function aggregateScenarioTotals(items: ScenarioProjectionItem[]): ScenarioTotals {
  return items.reduce<ScenarioTotals>(
    (acc, item) => {
      if (item.kind === "recurring") {
        acc.recurringMonthlyCents += item.monthlyCents;
        acc.monthlyTotalCents += item.monthlyCents;
        acc.yearlyTotalCents += item.yearlyCents;
        return acc;
      }

      if (item.kind === "financed") {
        acc.financedMonthlyCents += item.monthlyCents;
        acc.monthlyTotalCents += item.monthlyCents;
        acc.yearlyTotalCents += item.yearlyCents;
        return acc;
      }

      acc.oneTimeCents += item.oneTimeCents;
      acc.monthlyTotalCents += item.monthlyEquivalentCents;
      acc.yearlyTotalCents += item.yearlyCents;
      return acc;
    },
    {
      monthlyTotalCents: 0,
      yearlyTotalCents: 0,
      recurringMonthlyCents: 0,
      financedMonthlyCents: 0,
      oneTimeCents: 0,
    },
  );
}
