import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type AiPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type UsageWindow = {
  runsToday: number;
  spentCentsThisMonth: number;
};

const DEFAULT_PRICING: AiPricing = {
  inputUsdPerMillion: 0.4,
  outputUsdPerMillion: 1.6,
};

const MODEL_PRICING: Record<string, AiPricing> = {
  "gpt-4.1-mini": DEFAULT_PRICING,
  "gpt-4.1": { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
  "gpt-4o-mini": { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  "gpt-4o": { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  "gpt-5.4-nano": DEFAULT_PRICING,
  "gpt-5.4-mini": DEFAULT_PRICING,
};

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function dayStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function parseUsageMetadata(metadata: unknown): { source?: string; estimatedCostCents?: number } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const objectMetadata = metadata as Record<string, unknown>;
  return {
    source: typeof objectMetadata.source === "string" ? objectMetadata.source : undefined,
    estimatedCostCents:
      typeof objectMetadata.estimatedCostCents === "number"
        ? Math.max(0, Math.round(objectMetadata.estimatedCostCents))
        : undefined,
  };
}

export function estimateBudgetAiCostCents(args: { model: string; inputTokens: number; outputTokens: number }): number {
  const pricing = MODEL_PRICING[args.model] ?? DEFAULT_PRICING;
  const inputUsd = (args.inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputUsd = (args.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  return Math.max(0, Math.ceil((inputUsd + outputUsd) * 100));
}

export async function readBudgetAiUsage(now: Date): Promise<UsageWindow> {
  const [todayLogs, monthLogs] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        action: "budget_transaction_updated",
        createdAt: { gte: dayStartUtc(now) },
      },
      select: { metadata: true },
    }),
    prisma.activityLog.findMany({
      where: {
        action: "budget_transaction_updated",
        createdAt: { gte: monthStartUtc(now) },
      },
      select: { metadata: true },
    }),
  ]);

  const runsToday = todayLogs
    .map((entry) => parseUsageMetadata(entry.metadata))
    .filter((entry) => entry?.source?.startsWith("ai_")).length;

  const spentCentsThisMonth = monthLogs
    .map((entry) => parseUsageMetadata(entry.metadata))
    .filter((entry) => entry?.source?.startsWith("ai_"))
    .reduce((sum, entry) => sum + (entry?.estimatedCostCents ?? 0), 0);

  return {
    runsToday,
    spentCentsThisMonth,
  };
}

export async function assertBudgetAiRunAllowed(args: { estimatedCostCents: number }): Promise<void> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("openai_api_key_missing");
  }
  const usage = await readBudgetAiUsage(new Date());
  if (usage.runsToday >= env.OPENAI_MAX_RUNS_PER_DAY) {
    throw new Error("openai_daily_limit_reached");
  }
  const monthlyRemainingCents = Math.max(0, env.OPENAI_BUDGET_CENTS_MONTHLY - usage.spentCentsThisMonth);
  if (monthlyRemainingCents < Math.max(0, args.estimatedCostCents)) {
    throw new Error("openai_monthly_budget_reached");
  }
}
