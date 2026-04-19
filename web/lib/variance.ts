export type VarianceInputRow = {
  plannedCents: number;
  actualCents: number | null;
};

export type VarianceSummary = {
  plannedTotalCents: number;
  actualTotalCents: number;
  varianceTotalCents: number;
  actualCoverageCount: number;
  totalCount: number;
};

export function buildVarianceSummary(rows: VarianceInputRow[]): VarianceSummary {
  const plannedTotalCents = rows.reduce((sum, row) => sum + row.plannedCents, 0);
  const rowsWithActual = rows.filter((row) => row.actualCents !== null);
  const actualTotalCents = rowsWithActual.reduce((sum, row) => sum + (row.actualCents ?? 0), 0);

  return {
    plannedTotalCents,
    actualTotalCents,
    varianceTotalCents: actualTotalCents - plannedTotalCents,
    actualCoverageCount: rowsWithActual.length,
    totalCount: rows.length,
  };
}
