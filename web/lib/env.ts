import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_TIMEZONE: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  HOUSEHOLD_ACCOUNT_1_USERNAME: z.string().min(1),
  HOUSEHOLD_ACCOUNT_1_PASSWORD: z.string().min(1),
  HOUSEHOLD_ACCOUNT_2_USERNAME: z.string().min(1),
  HOUSEHOLD_ACCOUNT_2_PASSWORD: z.string().min(1),
});

const serverEnv = envSchema.safeParse(process.env);

if (!serverEnv.success) {
  console.error("Environment variable validation failed", serverEnv.error.flatten());
  throw new Error("Invalid server environment configuration.");
}

export const env = serverEnv.data;
