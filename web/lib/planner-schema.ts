import { z } from "zod";

export const plannerInputSchema = z.object({
  scenarioId: z.string().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1),
  notes: z.string().trim().max(500).optional().default(""),
  mortgagePrincipal: z.coerce.number().min(0),
  mortgageRateAnnualPct: z.coerce.number().min(0).max(100),
  mortgageTermMonths: z.coerce.number().int().min(1).max(600),
  propertyTaxMonthly: z.coerce.number().min(0),
  insuranceMonthly: z.coerce.number().min(0),
  utilitiesMonthly: z.coerce.number().min(0),
  otherMonthly: z.coerce.number().min(0),
  upgradeOneTimeCost: z.coerce.number().min(0),
  upgradeSpreadMonths: z.coerce.number().int().min(1).max(600),
  upgradeRateAnnualPct: z.coerce.number().min(0).max(100),
  compare: z.string().optional(),
});

export type PlannerInput = z.infer<typeof plannerInputSchema>;
