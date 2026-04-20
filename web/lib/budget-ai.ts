import { z } from "zod";

import { env } from "@/lib/env";
import { normalizeMerchantName } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

type AiPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type UsageWindow = {
  runsToday: number;
  spentCentsThisMonth: number;
};

export type BudgetAiPreflight = {
  model: string;
  rowsPlanned: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedLowCostCents: number;
  estimatedHighCostCents: number;
  monthlyBudgetCents: number;
  monthlyRemainingCents: number;
  runsLeftToday: number;
  keyConfigured: boolean;
};

export type BudgetAiCleanupResult = {
  scannedRows: number;
  updatedRows: number;
  skippedRows: number;
  acceptedSuggestions: number;
  confidenceThreshold: number;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCostCents: number;
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
};

const PROMPT_TOKENS_PER_ROW = 42;
const COMPLETION_TOKENS_PER_ROW = 24;
const CONFIDENCE_THRESHOLD = 0.78;

const aiCleanupSchema = z.object({
  updates: z.array(
    z.object({
      transactionId: z.string().min(1),
      normalizedMerchant: z.string().min(1),
      category: z.string().min(1),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1).max(300),
    }),
  ),
});

function getPricing(model: string): AiPricing {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

function estimateCostCents(args: { model: string; inputTokens: number; outputTokens: number }): number {
  const pricing = getPricing(args.model);
  const inputUsd = (args.inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputUsd = (args.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  return Math.max(0, Math.ceil((inputUsd + outputUsd) * 100));
}

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function dayStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function sanitizeCategory(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

async function readUsage(now: Date): Promise<UsageWindow> {
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

  const parseAsAiCleanup = (metadata: unknown): { source?: string; estimatedCostCents?: number } | null => {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }
    const objectMetadata = metadata as Record<string, unknown>;
    return {
      source: typeof objectMetadata.source === "string" ? objectMetadata.source : undefined,
      estimatedCostCents:
        typeof objectMetadata.estimatedCostCents === "number" ? Math.max(0, Math.round(objectMetadata.estimatedCostCents)) : undefined,
    };
  };

  const runsToday = todayLogs
    .map((entry) => parseAsAiCleanup(entry.metadata))
    .filter((entry) => entry?.source === "ai_cleanup").length;

  const spentCentsThisMonth = monthLogs
    .map((entry) => parseAsAiCleanup(entry.metadata))
    .filter((entry) => entry?.source === "ai_cleanup")
    .reduce((sum, entry) => sum + (entry?.estimatedCostCents ?? 0), 0);

  return {
    runsToday,
    spentCentsThisMonth,
  };
}

export async function getBudgetAiPreflight(monthKey: string): Promise<BudgetAiPreflight> {
  const [usage, uncategorizedCount] = await Promise.all([
    readUsage(new Date()),
    prisma.budgetTransaction.count({
      where: {
        monthKey,
        category: "uncategorized",
      },
    }),
  ]);

  const rowsPlanned = Math.min(uncategorizedCount, env.OPENAI_MAX_ROWS_PER_RUN);
  const estimatedInputTokens = rowsPlanned * PROMPT_TOKENS_PER_ROW;
  const estimatedOutputTokens = rowsPlanned * COMPLETION_TOKENS_PER_ROW;
  const baselineEstimate = estimateCostCents({
    model: env.OPENAI_MODEL,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
  });
  const estimatedLowCostCents = Math.floor(baselineEstimate * 0.7);
  const estimatedHighCostCents = Math.max(estimatedLowCostCents, Math.ceil(baselineEstimate * 1.35));
  const monthlyRemainingCents = Math.max(0, env.OPENAI_BUDGET_CENTS_MONTHLY - usage.spentCentsThisMonth);

  return {
    model: env.OPENAI_MODEL,
    rowsPlanned,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedLowCostCents,
    estimatedHighCostCents,
    monthlyBudgetCents: env.OPENAI_BUDGET_CENTS_MONTHLY,
    monthlyRemainingCents,
    runsLeftToday: Math.max(0, env.OPENAI_MAX_RUNS_PER_DAY - usage.runsToday),
    keyConfigured: Boolean(env.OPENAI_API_KEY),
  };
}

function buildSystemPrompt(): string {
  return [
    "You are cleaning household budget transactions.",
    "Return JSON only.",
    "Do not invent transactions or IDs.",
    "Prefer existing categories such as groceries, utilities, housing, transport, dining, shopping, subscriptions, healthcare, uncategorized.",
    "Keep categories concise and lowercase.",
    "Keep normalizedMerchant lowercase and cleaned (letters, numbers, spaces).",
  ].join(" ");
}

async function callOpenAiCleanup(args: {
  model: string;
  transactions: Array<{
    id: string;
    description: string;
    normalizedMerchant: string;
    amountCents: number;
    category: string;
  }>;
}): Promise<{ parsed: z.infer<typeof aiCleanupSchema>; promptTokens: number | null; completionTokens: number | null }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("openai_api_key_missing");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "budget_cleanup",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["updates"],
            properties: {
              updates: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["transactionId", "normalizedMerchant", "category", "confidence", "reason"],
                  properties: {
                    transactionId: { type: "string" },
                    normalizedMerchant: { type: "string" },
                    category: { type: "string" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            task: "Suggest merchant/category cleanup for each row.",
            transactions: args.transactions,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`openai_request_failed_${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("openai_empty_response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new Error("openai_invalid_json");
  }

  const parsed = aiCleanupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("openai_schema_mismatch");
  }

  return {
    parsed: parsed.data,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}

export async function cleanBudgetDataWithAi(args: { monthKey: string }): Promise<BudgetAiCleanupResult> {
  const preflight = await getBudgetAiPreflight(args.monthKey);
  if (!preflight.keyConfigured) {
    throw new Error("openai_api_key_missing");
  }
  if (preflight.runsLeftToday <= 0) {
    throw new Error("openai_daily_limit_reached");
  }
  if (preflight.rowsPlanned <= 0) {
    return {
      scannedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      acceptedSuggestions: 0,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
      promptTokens: null,
      completionTokens: null,
      estimatedCostCents: 0,
    };
  }
  if (preflight.monthlyRemainingCents < preflight.estimatedLowCostCents) {
    throw new Error("openai_monthly_budget_reached");
  }

  const transactions = await prisma.budgetTransaction.findMany({
    where: {
      monthKey: args.monthKey,
      category: "uncategorized",
    },
    orderBy: { postedAt: "desc" },
    take: env.OPENAI_MAX_ROWS_PER_RUN,
    select: {
      id: true,
      description: true,
      normalizedMerchant: true,
      amountCents: true,
      category: true,
    },
  });

  if (transactions.length === 0) {
    return {
      scannedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      acceptedSuggestions: 0,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
      promptTokens: null,
      completionTokens: null,
      estimatedCostCents: 0,
    };
  }

  const ai = await callOpenAiCleanup({
    model: env.OPENAI_MODEL,
    transactions,
  });

  const txById = new Map(transactions.map((tx) => [tx.id, tx]));
  let acceptedSuggestions = 0;
  let updatedRows = 0;
  let skippedRows = 0;

  await prisma.$transaction(async (tx) => {
    for (const suggestion of ai.parsed.updates) {
      const current = txById.get(suggestion.transactionId);
      if (!current) {
        skippedRows += 1;
        continue;
      }
      if (suggestion.confidence < CONFIDENCE_THRESHOLD) {
        skippedRows += 1;
        continue;
      }

      const sanitizedCategory = sanitizeCategory(suggestion.category);
      const sanitizedMerchant = normalizeMerchantName(suggestion.normalizedMerchant);
      if (!sanitizedCategory || !sanitizedMerchant) {
        skippedRows += 1;
        continue;
      }

      acceptedSuggestions += 1;
      const willChange = sanitizedCategory !== current.category || sanitizedMerchant !== current.normalizedMerchant;
      if (!willChange) {
        skippedRows += 1;
        continue;
      }

      await tx.budgetTransaction.update({
        where: { id: current.id },
        data: {
          category: sanitizedCategory,
          normalizedMerchant: sanitizedMerchant,
        },
      });
      updatedRows += 1;
    }
  });

  const estimatedCostCents =
    ai.promptTokens !== null && ai.completionTokens !== null
      ? estimateCostCents({
          model: env.OPENAI_MODEL,
          inputTokens: ai.promptTokens,
          outputTokens: ai.completionTokens,
        })
      : estimateCostCents({
          model: env.OPENAI_MODEL,
          inputTokens: preflight.estimatedInputTokens,
          outputTokens: preflight.estimatedOutputTokens,
        });

  return {
    scannedRows: transactions.length,
    updatedRows,
    skippedRows,
    acceptedSuggestions,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    promptTokens: ai.promptTokens,
    completionTokens: ai.completionTokens,
    estimatedCostCents,
  };
}
