import { z } from "zod";

export const saveHomeProfileSnapshotSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  propertyAddress: z.string().trim().min(5).max(250),
  semiMonthlyPayment: z.coerce.number().min(0),
  mortgageInterestRatePct: z.coerce.number().min(0).max(100),
  mortgageTermYears: z.coerce.number().int().min(1).max(40).default(5),
  mortgageTermStartMonthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  mortgageLender: z.string().trim().max(120).optional().default(""),
  mortgageNotes: z.string().trim().max(500).optional().default(""),
  propertyTaxYearly: z.coerce.number().min(0),
  waterMonthly: z.coerce.number().min(0),
  gasMonthly: z.coerce.number().min(0),
  hydroMonthly: z.coerce.number().min(0),
});

export type SaveHomeProfileSnapshotInput = z.infer<typeof saveHomeProfileSnapshotSchema>;
