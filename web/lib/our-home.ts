import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { resolveProjectionMonthKey } from "@/lib/projections";
import type { SaveHomeProfileSnapshotInput } from "@/lib/our-home-schema";

export type HomeProfileFormValues = {
  monthKey: string;
  propertyAddress: string;
  semiMonthlyPayment: string;
  mortgageInterestRatePct: string;
  mortgageTermYears: string;
  mortgageTermStartMonthKey: string;
  mortgageTermEndMonthKey: string;
  mortgageLender: string;
  mortgageNotes: string;
  propertyTaxYearly: string;
  waterMonthly: string;
  gasMonthly: string;
  hydroMonthly: string;
};

export type HomeProfileSnapshotView = {
  values: HomeProfileFormValues;
  monthlyMortgagePaymentCents: number;
  monthlyPropertyTaxCents: number;
  monthlyUtilitiesTotalCents: number;
  monthlyHousingCoreCents: number;
};

function centsToAmountString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function amountToCents(value: number): number {
  return toCents(value, { allowZero: true });
}

function normalizeMonthKey(monthKey: string): string {
  return resolveProjectionMonthKey(monthKey);
}

function addMonths(monthKey: string, monthsToAdd: number): string {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const index = year * 12 + (month - 1) + monthsToAdd;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function deriveMortgageTermEndMonthKey(startMonthKey: string, termYears: number): string {
  return addMonths(startMonthKey, termYears * 12 - 1);
}

export function computeMonthlyMortgagePaymentCents(semiMonthlyPaymentCents: number): number {
  return semiMonthlyPaymentCents * 2;
}

export function computeMonthlyPropertyTaxCents(propertyTaxYearlyCents: number): number {
  return Math.round(propertyTaxYearlyCents / 12);
}

function makeDefaultFormValues(monthKey: string): HomeProfileFormValues {
  return {
    monthKey,
    propertyAddress: "",
    semiMonthlyPayment: "0.00",
    mortgageInterestRatePct: "0.000",
    mortgageTermYears: "5",
    mortgageTermStartMonthKey: monthKey,
    mortgageTermEndMonthKey: deriveMortgageTermEndMonthKey(monthKey, 5),
    mortgageLender: "",
    mortgageNotes: "",
    propertyTaxYearly: "0.00",
    waterMonthly: "0.00",
    gasMonthly: "0.00",
    hydroMonthly: "0.00",
  };
}

function toView(values: HomeProfileFormValues): HomeProfileSnapshotView {
  const semiMonthlyPaymentCents = toCents(values.semiMonthlyPayment, { allowZero: true });
  const propertyTaxYearlyCents = toCents(values.propertyTaxYearly, { allowZero: true });
  const waterMonthlyCents = toCents(values.waterMonthly, { allowZero: true });
  const gasMonthlyCents = toCents(values.gasMonthly, { allowZero: true });
  const hydroMonthlyCents = toCents(values.hydroMonthly, { allowZero: true });
  const monthlyMortgagePaymentCents = computeMonthlyMortgagePaymentCents(semiMonthlyPaymentCents);
  const monthlyPropertyTaxCents = computeMonthlyPropertyTaxCents(propertyTaxYearlyCents);
  const monthlyUtilitiesTotalCents = waterMonthlyCents + gasMonthlyCents + hydroMonthlyCents;

  return {
    values,
    monthlyMortgagePaymentCents,
    monthlyPropertyTaxCents,
    monthlyUtilitiesTotalCents,
    monthlyHousingCoreCents: monthlyMortgagePaymentCents + monthlyPropertyTaxCents + monthlyUtilitiesTotalCents,
  };
}

export async function getHomeProfileSnapshotView(monthKeyInput: string): Promise<HomeProfileSnapshotView> {
  const monthKey = normalizeMonthKey(monthKeyInput);
  const exact = await prisma.homeProfileSnapshot.findUnique({ where: { monthKey } });
  const fallback =
    exact ??
    (await prisma.homeProfileSnapshot.findFirst({
      orderBy: { monthKey: "desc" },
    }));

  if (!fallback) {
    return toView(makeDefaultFormValues(monthKey));
  }

  const values: HomeProfileFormValues = {
    monthKey,
    propertyAddress: fallback.propertyAddress,
    semiMonthlyPayment: centsToAmountString(fallback.semiMonthlyPaymentCents),
    mortgageInterestRatePct: Number(fallback.mortgageInterestRatePct).toFixed(3),
    mortgageTermYears: String(fallback.mortgageTermYears),
    mortgageTermStartMonthKey: fallback.mortgageTermStartMonthKey,
    mortgageTermEndMonthKey: fallback.mortgageTermEndMonthKey,
    mortgageLender: fallback.mortgageLender ?? "",
    mortgageNotes: fallback.mortgageNotes ?? "",
    propertyTaxYearly: centsToAmountString(fallback.propertyTaxYearlyCents),
    waterMonthly: centsToAmountString(fallback.waterMonthlyCents),
    gasMonthly: centsToAmountString(fallback.gasMonthlyCents),
    hydroMonthly: centsToAmountString(fallback.hydroMonthlyCents),
  };

  return toView(values);
}

export function mapInputToSnapshotUpsert(input: SaveHomeProfileSnapshotInput): {
  monthKey: string;
  propertyAddress: string;
  semiMonthlyPaymentCents: number;
  mortgageInterestRatePct: string;
  mortgageTermYears: number;
  mortgageTermStartMonthKey: string;
  mortgageTermEndMonthKey: string;
  mortgageLender: string | null;
  mortgageNotes: string | null;
  propertyTaxYearlyCents: number;
  waterMonthlyCents: number;
  gasMonthlyCents: number;
  hydroMonthlyCents: number;
} {
  const monthKey = normalizeMonthKey(input.monthKey);
  const termStartMonthKey = normalizeMonthKey(input.mortgageTermStartMonthKey);
  return {
    monthKey,
    propertyAddress: input.propertyAddress.trim(),
    semiMonthlyPaymentCents: amountToCents(input.semiMonthlyPayment),
    mortgageInterestRatePct: input.mortgageInterestRatePct.toFixed(3),
    mortgageTermYears: input.mortgageTermYears,
    mortgageTermStartMonthKey: termStartMonthKey,
    mortgageTermEndMonthKey: deriveMortgageTermEndMonthKey(termStartMonthKey, input.mortgageTermYears),
    mortgageLender: input.mortgageLender.trim() || null,
    mortgageNotes: input.mortgageNotes.trim() || null,
    propertyTaxYearlyCents: amountToCents(input.propertyTaxYearly),
    waterMonthlyCents: amountToCents(input.waterMonthly),
    gasMonthlyCents: amountToCents(input.gasMonthly),
    hydroMonthlyCents: amountToCents(input.hydroMonthly),
  };
}
