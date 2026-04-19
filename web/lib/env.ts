import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_TIMEZONE: z.string().min(1).default("UTC"),
  SESSION_SECRET: z.string().min(16),
});

const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";

const buildTimeFallbacks = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/home_dashboard?schema=public",
  APP_TIMEZONE: "UTC",
  SESSION_SECRET: "build-only-session-secret-placeholder",
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
