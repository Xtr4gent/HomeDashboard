import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_TIMEZONE: z.string().min(1).default("UTC"),
  SESSION_SECRET: z.string().min(16),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_MODEL_ROUTER: z.string().min(1).default("gpt-5.4-nano"),
  OPENAI_MODEL_SUPERVISOR: z.string().min(1).default("gpt-5.4-mini"),
  OPENAI_BUDGET_CENTS_MONTHLY: z.coerce.number().int().positive().default(500),
  OPENAI_MAX_ROWS_PER_RUN: z.coerce.number().int().positive().default(40),
  OPENAI_MAX_RUNS_PER_DAY: z.coerce.number().int().positive().default(3),
});

const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";

const buildTimeFallbacks = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/home_dashboard?schema=public",
  APP_TIMEZONE: "UTC",
  SESSION_SECRET: "build-only-session-secret-placeholder",
  OPENAI_MODEL: "gpt-4.1-mini",
  OPENAI_MODEL_ROUTER: "gpt-5.4-nano",
  OPENAI_MODEL_SUPERVISOR: "gpt-5.4-mini",
  OPENAI_BUDGET_CENTS_MONTHLY: "500",
  OPENAI_MAX_ROWS_PER_RUN: "40",
  OPENAI_MAX_RUNS_PER_DAY: "3",
} as const;

const rawEnv = isProductionBuildPhase
  ? {
      ...buildTimeFallbacks,
      ...process.env,
    }
  : process.env;

const serverEnv = envSchema.safeParse(rawEnv);

if (!serverEnv.success) {
  console.error("Environment variable validation failed", serverEnv.error.flatten());
  throw new Error("Invalid server environment configuration.");
}

if (isProductionBuildPhase) {
  const missingAtBuild = Object.keys(buildTimeFallbacks).filter((key) => !process.env[key]);
  if (missingAtBuild.length > 0) {
    console.warn(
      "Using build-time fallback environment values for:",
      missingAtBuild.join(", "),
      "Provide real values in runtime environment before starting the app.",
    );
  }
}

export const env = serverEnv.data;
