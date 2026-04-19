export type ToCentsOptions = {
  allowZero?: boolean;
};

export function toCents(rawAmount: string | number, options: ToCentsOptions = {}): number {
  const parsed = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
  const allowZero = options.allowZero ?? false;

  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(allowZero ? "Amount must be zero or greater." : "Amount must be a positive number.");
  }

  return Math.round(parsed * 100);
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}
