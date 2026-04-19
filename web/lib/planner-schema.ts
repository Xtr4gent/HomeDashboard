import { z } from "zod";

export const plannerInputSchema = z
  .object({
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
    recurrenceMode: z.enum(["monthly_day", "monthly_last_day", "semi_monthly", "yearly"]).default("monthly_day"),
    dueDay: z.coerce.number().int().min(1).max(31).default(15),
    secondDueDay: z.coerce.number().int().min(1).max(31).optional(),
    dueMonth: z.coerce.number().int().min(1).max(12).optional(),
    compare: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.recurrenceMode === "semi_monthly") {
      if (!input.secondDueDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secondDueDay"],
          message: "Second due day is required for semi-monthly recurrence.",
        });
      } else if (input.secondDueDay <= input.dueDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secondDueDay"],
          message: "Second due day must be greater than first due day.",
        });
      }
    }

    if (input.recurrenceMode === "yearly" && !input.dueMonth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueMonth"],
        message: "Due month is required for yearly recurrence.",
      });
    }
  });

export type PlannerInput = z.infer<typeof plannerInputSchema>;
