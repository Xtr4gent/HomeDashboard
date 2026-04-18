export function toCents(rawAmount: string): number {
  const parsed = Number(rawAmount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  return Math.round(parsed * 100);
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}
