import { prisma } from "@/lib/prisma";
import { assertBudgetAiRunAllowed, estimateBudgetAiCostCents } from "@/lib/budget-ai-guardrails";
import { monthKeyFromDate } from "@/lib/time";

export type ParsedCsvData = {
  headers: string[];
  rows: string[][];
};

export type BudgetOverview = {
  incomeCents: number;
  expensesCents: number;
  netCents: number;
  transactionCount: number;
  uncategorizedCount: number;
};

export type BudgetTrendPoint = {
  monthKey: string;
  outflowCents: number;
  inflowCents: number;
  netCents: number;
};

export type RecurringInsight = {
  merchant: string;
  count: number;
  averageAmountCents: number;
  estimatedNextDate: string | null;
};

export type BudgetCleanedImportRow = {
  postedAt: string;
  description: string;
  amountCents: number;
};

type NormalizedImportRow = {
  postedAt: Date;
  description: string;
  amountCents: number;
};

type AiNormalizationResult = {
  rows: NormalizedImportRow[];
  estimatedCostCents: number;
};

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function buildCleanedImportCsv(rows: BudgetCleanedImportRow[]): string {
  const header = "postedAt,description,amount";
  const body = rows.map((row) => `${row.postedAt},${escapeCsvCell(row.description)},${(row.amountCents / 100).toFixed(2)}`);
  return [header, ...body].join("\n");
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function countDelimiter(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let winner = ",";
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = countDelimiter(headerLine, candidate);
    if (score > bestScore) {
      winner = candidate;
      bestScore = score;
    }
  }
  return winner;
}

const HEADER_HINT_ALIASES = [
  "date",
  "transactiondate",
  "posteddate",
  "description",
  "details",
  "memo",
  "payee",
  "merchant",
  "amount",
  "value",
  "debit",
  "credit",
  "withdrawal",
  "deposit",
  "activity",
];

function findHeaderLineIndex(lines: string[]): { index: number; delimiter: string } {
  let bestIndex = 0;
  let bestDelimiter = detectDelimiter(lines[0] ?? ",");
  let bestScore = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const delimiter = detectDelimiter(line);
    const cells = parseCsvLine(line, delimiter);
    if (cells.length < 3) {
      continue;
    }
    const aliasHits = cells.reduce((sum, cell) => {
      const normalized = normalizeHeaderKey(cell);
      const hit = HEADER_HINT_ALIASES.some((alias) => normalized.includes(alias));
      return sum + (hit ? 1 : 0);
    }, 0);
    if (aliasHits < 2) {
      continue;
    }
    const score = aliasHits * 10 + cells.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
      bestDelimiter = delimiter;
    }
  }
  return { index: bestIndex, delimiter: bestDelimiter };
}

export function parseCsv(content: string): ParsedCsvData {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headerLine = findHeaderLineIndex(lines);
  const headers = parseCsvLine(lines[headerLine.index], headerLine.delimiter).map((header) => header.toLowerCase());
  const rows = lines.slice(headerLine.index + 1).map((line) => parseCsvLine(line, headerLine.delimiter));
  return { headers, rows };
}

function normalizeHeaderKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map((alias) => normalizeHeaderKey(alias));
  return headers.findIndex((header) => {
    const normalized = normalizeHeaderKey(header);
    return normalizedAliases.some((alias) => normalized.includes(alias));
  });
}

function aiModel(): string {
  return process.env.OPENAI_MODEL_ROUTER || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function aiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function parseAiRows(payload: unknown): Array<{ postedAt: string; description: string; amount: string | number }> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const rows = (payload as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }
      const candidate = row as Record<string, unknown>;
      const postedAt = typeof candidate.postedAt === "string" ? candidate.postedAt.trim() : "";
      const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
      const amount = candidate.amount;
      if (!postedAt || !description || (typeof amount !== "string" && typeof amount !== "number")) {
        return null;
      }
      return {
        postedAt,
        description,
        amount,
      };
    })
    .filter((row): row is { postedAt: string; description: string; amount: string | number } => row !== null);
}

async function normalizeRowsWithAi(args: {
  headers: string[];
  rows: string[][];
}): Promise<AiNormalizationResult> {
  const key = aiKey();
  if (!key) {
    throw new Error("CSV headers not recognized and OPENAI_API_KEY is not configured.");
  }
  if (args.rows.length === 0) {
    return { rows: [], estimatedCostCents: 0 };
  }

  const estimatedInputTokens = args.rows.length * 30;
  const estimatedOutputTokens = args.rows.length * 18;
  await assertBudgetAiRunAllowed({
    estimatedCostCents: estimateBudgetAiCostCents({
      model: aiModel(),
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
    }),
  });

  const chunks: string[][][] = [];
  for (let index = 0; index < args.rows.length; index += 150) {
    chunks.push(args.rows.slice(index, index + 150));
  }

  const normalized: NormalizedImportRow[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  const preferredModel = aiModel();
  const modelFallbacks = preferredModel === "gpt-4.1-mini" ? [preferredModel] : [preferredModel, "gpt-4.1-mini"];

  for (const chunk of chunks) {
    let parsedJson: unknown = null;
    let lastError: Error | null = null;

    for (const model of modelFallbacks) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "normalized_budget_rows",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["rows"],
                  properties: {
                    rows: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["postedAt", "description", "amount"],
                        properties: {
                          postedAt: { type: "string" },
                          description: { type: "string" },
                          amount: {
                            anyOf: [{ type: "string" }, { type: "number" }],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            messages: [
              {
                role: "system",
                content:
                  "You normalize bank CSV rows for import. Return JSON only. For each row that represents a real transaction, return postedAt (YYYY-MM-DD), description, and signed amount. Expenses must be negative, income positive. Skip non-transaction rows. Never invent transactions.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  headers: args.headers,
                  rows: chunk,
                }),
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`openai_csv_parse_failed_${response.status}`);
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("openai_csv_parse_empty_response");
        }
        promptTokens += Math.max(0, Math.round(payload.usage?.prompt_tokens ?? 0));
        completionTokens += Math.max(0, Math.round(payload.usage?.completion_tokens ?? 0));

        try {
          parsedJson = JSON.parse(content);
        } catch {
          throw new Error("openai_csv_parse_invalid_json");
        }
        lastError = null;
        break;
      } catch (error: unknown) {
        const currentError = error instanceof Error ? error : new Error("openai_csv_parse_failed");
        lastError = currentError;
        const retryable = /openai_csv_parse_failed_(400|404|422)/.test(currentError.message);
        if (!retryable) {
          throw currentError;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const aiRows = parseAiRows(parsedJson);
    for (const row of aiRows) {
      const postedAt = new Date(row.postedAt);
      if (Number.isNaN(postedAt.getTime())) {
        continue;
      }
      const amountCents = parseBudgetAmount(String(row.amount));
      if (amountCents === 0) {
        continue;
      }
      normalized.push({
        postedAt,
        description: row.description,
        amountCents,
      });
    }
  }

  return {
    rows: normalized,
    estimatedCostCents: estimateBudgetAiCostCents({
      model: preferredModel,
      inputTokens: promptTokens || estimatedInputTokens,
      outputTokens: completionTokens || estimatedOutputTokens,
    }),
  };
}

export function parseBudgetAmount(raw: string): number {
  const normalized = raw.replace(/[$,\s]/g, "").toLowerCase();
  if (!normalized) {
    return 0;
  }

  let working = normalized;
  let sign = 1;

  if (working.includes("(") && working.includes(")")) {
    sign = -1;
  }
  working = working.replace(/[()]/g, "");

  if (working.endsWith("-")) {
    sign = -1;
    working = working.slice(0, -1);
  }
  if (working.startsWith("-")) {
    sign = -1;
    working = working.slice(1);
  }

  if (working.endsWith("dr")) {
    sign = -1;
    working = working.slice(0, -2);
  } else if (working.endsWith("cr")) {
    sign = 1;
    working = working.slice(0, -2);
  }

  const parsed = Number(working);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100) * sign;
}

export function normalizeMerchantName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(raw: string): string {
  return raw
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toReadableTransactionName(args: { normalizedMerchant: string; description: string }): string {
  const merchant = args.normalizedMerchant
    .trim()
    .toLowerCase()
    .replace(/\b(pos|debit|credit|purchase|payment|online|store|terminal)\b/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (merchant) {
    return toTitleCase(merchant).slice(0, 48);
  }
  const cleaned = args.description
    .toLowerCase()
    .replace(/\d{4,}/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "Unknown merchant";
  }
  return toTitleCase(cleaned).slice(0, 64);
}

export function buildBudgetFingerprint(args: {
  postedAt: Date;
  normalizedMerchant: string;
  amountCents: number;
}): string {
  const dateKey = args.postedAt.toISOString().slice(0, 10);
  return `${dateKey}:${args.normalizedMerchant}:${Math.abs(args.amountCents)}`;
}

function fallbackCategory(description: string): string {
  const normalized = description.toLowerCase();
  if (normalized.includes("grocery") || normalized.includes("superstore") || normalized.includes("market")) {
    return "groceries";
  }
  if (normalized.includes("hydro") || normalized.includes("gas bill") || normalized.includes("water")) {
    return "utilities";
  }
  if (normalized.includes("mortgage") || normalized.includes("rent")) {
    return "housing";
  }
  if (normalized.includes("uber") || normalized.includes("transit") || normalized.includes("fuel")) {
    return "transport";
  }
  return "uncategorized";
}

export function summarizeBudgetTransactions(
  transactions: Array<{ amountCents: number; category: string }>,
): BudgetOverview {
  const incomeCents = transactions.filter((row) => row.amountCents > 0).reduce((sum, row) => sum + row.amountCents, 0);
  const expensesCents = transactions.filter((row) => row.amountCents < 0).reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
  const uncategorizedCount = transactions.filter((row) => row.category === "uncategorized").length;
  return {
    incomeCents,
    expensesCents,
    netCents: incomeCents - expensesCents,
    transactionCount: transactions.length,
    uncategorizedCount,
  };
}

export async function importBudgetCsv(args: {
  accountName: string;
  institution?: string;
  monthKey: string;
  sourceFilename?: string;
  sourceChecksum?: string;
  csvContent: string;
}) {
  const parsed = parseCsv(args.csvContent);
  if (parsed.headers.length === 0) {
    throw new Error("CSV is empty.");
  }

  const dateIndex = findHeaderIndex(parsed.headers, ["date", "transactiondate", "posteddate", "processingdate"]);
  const descriptionIndex = findHeaderIndex(parsed.headers, [
    "description",
    "merchant",
    "details",
    "memo",
    "payee",
    "narrative",
  ]);
  const amountIndex = findHeaderIndex(parsed.headers, ["amount", "transactionamount", "cad", "value"]);
  const debitIndex = findHeaderIndex(parsed.headers, ["debit", "withdrawal", "moneyout", "charge"]);
  const creditIndex = findHeaderIndex(parsed.headers, ["credit", "deposit", "moneyin"]);
  const hasStandardColumns = dateIndex >= 0 && descriptionIndex >= 0 && (amountIndex >= 0 || debitIndex >= 0 || creditIndex >= 0);

  let normalizedRows: NormalizedImportRow[] = [];
  let aiNormalizationCostCents = 0;
  let aiNormalizationUsed = false;
  if (hasStandardColumns) {
    normalizedRows = parsed.rows
      .map((row) => {
        const postedAt = new Date(row[dateIndex] ?? "");
        if (Number.isNaN(postedAt.getTime())) {
          return null;
        }
        const description = (row[descriptionIndex] ?? "").trim();
        if (!description) {
          return null;
        }
        let amountCents = 0;
        if (amountIndex >= 0) {
          amountCents = parseBudgetAmount(row[amountIndex] ?? "");
        } else {
          const debitCents = debitIndex >= 0 ? parseBudgetAmount(row[debitIndex] ?? "") : 0;
          const creditCents = creditIndex >= 0 ? parseBudgetAmount(row[creditIndex] ?? "") : 0;
          amountCents = creditCents - debitCents;
        }
        if (amountCents === 0) {
          return null;
        }
        return {
          postedAt,
          description,
          amountCents,
        };
      })
      .filter((row): row is NormalizedImportRow => row !== null);
  } else {
    const aiNormalization = await normalizeRowsWithAi({
      headers: parsed.headers,
      rows: parsed.rows,
    });
    normalizedRows = aiNormalization.rows;
    aiNormalizationCostCents = aiNormalization.estimatedCostCents;
    aiNormalizationUsed = true;
    if (normalizedRows.length === 0) {
      throw new Error("CSV could not be normalized from this format.");
    }
  }

  const cleanedRows: BudgetCleanedImportRow[] = normalizedRows.map((row) => ({
    postedAt: row.postedAt.toISOString().slice(0, 10),
    description: row.description,
    amountCents: row.amountCents,
  }));

  const account = await prisma.budgetAccount.upsert({
    where: {
      name_institution: {
        name: args.accountName.trim(),
        institution: args.institution?.trim() || "",
      },
    },
    update: {},
    create: {
      name: args.accountName.trim(),
      institution: args.institution?.trim() || "",
    },
  });

  const rules = await prisma.budgetCategoryRule.findMany({
    orderBy: { priority: "desc" },
  });

  const batch = await prisma.budgetImportBatch.create({
    data: {
      accountId: account.id,
      monthKey: args.monthKey,
      status: "queued",
      rowCount: parsed.rows.length,
      sourceFilename: args.sourceFilename?.trim() || null,
      sourceChecksum: args.sourceChecksum?.trim() || null,
      sourceUploadedAt: new Date(),
      parserVersion: "budget-parser-v1",
      parseStatus: "uploaded",
      cleanedRowCount: cleanedRows.length,
      aiNormalizationUsed,
      aiNormalizationCostCents,
      cleanedRowsJson: cleanedRows,
    },
  });

  await prisma.budgetImportBatch.update({
    where: { id: batch.id },
    data: {
      parseStatus: "parsed",
    },
  });

  let importedCount = 0;
  let duplicateCount = 0;
  const observedMonthCounts = new Map<string, number>();
  const importedMonthCounts = new Map<string, number>();
  for (const row of normalizedRows) {
    const postedAt = row.postedAt;
    const description = row.description;
    const amountCents = row.amountCents;
    const observedMonthKey = monthKeyFromDate(postedAt);
    observedMonthCounts.set(observedMonthKey, (observedMonthCounts.get(observedMonthKey) ?? 0) + 1);
    const normalizedMerchant = normalizeMerchantName(description);
    const fingerprint = buildBudgetFingerprint({
      postedAt,
      normalizedMerchant,
      amountCents,
    });
    const match = await prisma.budgetTxnMatch.findUnique({ where: { fingerprint } });
    if (match) {
      duplicateCount += 1;
      continue;
    }

    const normalizedDescription = description.toLowerCase();
    const matchedRule = rules.find((rule) => normalizedDescription.includes(rule.matchText.toLowerCase()));
    const category = matchedRule?.category ?? fallbackCategory(description);
    await prisma.$transaction(async (tx) => {
      await tx.budgetTxnMatch.create({ data: { fingerprint } });
      await tx.budgetTransaction.create({
        data: {
          accountId: account.id,
          importBatchId: batch.id,
          postedAt,
          monthKey: monthKeyFromDate(postedAt),
          description,
          normalizedMerchant,
          amountCents,
          category,
        },
      });
    });
    const importedMonthKey = monthKeyFromDate(postedAt);
    importedMonthCounts.set(importedMonthKey, (importedMonthCounts.get(importedMonthKey) ?? 0) + 1);
    importedCount += 1;
  }

  await prisma.budgetImportBatch.update({
    where: { id: batch.id },
    data: {
      parseStatus: "normalized",
    },
  });

  const primaryImportedMonthKey =
    [...observedMonthCounts.entries()].sort((a, b) => b[1] - a[1]).at(0)?.[0] ??
    [...importedMonthCounts.entries()].sort((a, b) => b[1] - a[1]).at(0)?.[0] ??
    monthKeyFromDate(new Date());

  await prisma.budgetImportBatch.update({
    where: { id: batch.id },
    data: {
      monthKey: primaryImportedMonthKey,
      importedCount,
      duplicateCount,
      sourceFilename: args.sourceFilename?.trim() || null,
      sourceChecksum: args.sourceChecksum?.trim() || null,
      sourceUploadedAt: new Date(),
      parserVersion: "budget-parser-v1",
      parseStatus: "ready_for_review",
      cleanedRowCount: cleanedRows.length,
      aiNormalizationUsed,
      aiNormalizationCostCents,
      cleanedRowsJson: cleanedRows,
      status: "completed",
    },
  });

  return {
    batchId: batch.id,
    importedCount,
    duplicateCount,
    rowCount: parsed.rows.length,
    importedMonthKey: primaryImportedMonthKey,
    cleanedRowCount: cleanedRows.length,
    aiNormalizationUsed,
    aiNormalizationCostCents,
  };
}

export function calculateMonthCoverage(args: {
  transactionCount: number;
  uncategorizedCount: number;
}): number {
  if (args.transactionCount <= 0) {
    return 100;
  }
  const categorizedCount = Math.max(0, args.transactionCount - args.uncategorizedCount);
  return Math.round((categorizedCount / args.transactionCount) * 100);
}

export function calculateDeterministicCashOutlook(args: {
  monthKey: string;
  incomeCents: number;
  expensesCents: number;
}): {
  knownNetCents: number;
  projectedMonthEndNetCents: number;
  assumptions: string[];
} {
  const [yearText, monthText] = args.monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const now = new Date();
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
  const dayCount = monthEnd.getUTCDate();
  const todayDay = Math.min(dayCount, now.getUTCDate());
  const elapsedDays = Math.max(1, todayDay);
  const daysRemaining = Math.max(0, dayCount - elapsedDays);
  const knownNetCents = args.incomeCents - args.expensesCents;
  const averageDailyNet = Math.round(knownNetCents / elapsedDays);
  return {
    knownNetCents,
    projectedMonthEndNetCents: knownNetCents + averageDailyNet * daysRemaining,
    assumptions: [
      `Known net uses imported rows only for ${args.monthKey}.`,
      "Projected month-end assumes daily net trend continues linearly for remaining days.",
    ],
  };
}

export async function getBudgetImportBatchCleanedRows(batchId: string): Promise<BudgetCleanedImportRow[] | null> {
  const batch = await prisma.budgetImportBatch.findUnique({
    where: { id: batchId },
    select: {
      cleanedRowsJson: true,
    },
  });
  const rows = batch?.cleanedRowsJson;
  if (!Array.isArray(rows)) {
    return null;
  }
  const parsed: BudgetCleanedImportRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidate = row as Record<string, unknown>;
    if (
      typeof candidate.postedAt === "string" &&
      typeof candidate.description === "string" &&
      typeof candidate.amountCents === "number"
    ) {
      parsed.push({
        postedAt: candidate.postedAt,
        description: candidate.description,
        amountCents: candidate.amountCents,
      });
    }
  }
  return parsed;
}

export async function getLatestImportedBudgetMonthKey(): Promise<string | null> {
  const latestTransaction = await prisma.budgetTransaction.findFirst({
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    select: { monthKey: true },
  });
  return latestTransaction?.monthKey ?? null;
}

function shiftMonth(monthKey: string, offset: number): string {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getBudgetPageData(monthKey: string) {
  const [transactions, targets, accounts, batches, allRecent, pendingSuggestions] = await Promise.all([
    prisma.budgetTransaction.findMany({
      where: { monthKey },
      orderBy: { postedAt: "desc" },
      take: 300,
    }),
    prisma.budgetMonthlyTarget.findMany({
      where: { monthKey },
      orderBy: { category: "asc" },
    }),
    prisma.budgetAccount.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.budgetImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { account: true },
    }),
    prisma.budgetTransaction.findMany({
      where: { monthKey: { in: [shiftMonth(monthKey, -5), shiftMonth(monthKey, -4), shiftMonth(monthKey, -3), shiftMonth(monthKey, -2), shiftMonth(monthKey, -1), monthKey] } },
      orderBy: { postedAt: "asc" },
    }),
    prisma.budgetAiSuggestion.findMany({
      where: {
        monthKey,
        status: "pending",
      },
      orderBy: [{ confidence: "asc" }, { createdAt: "desc" }],
      include: {
        transaction: true,
      },
      take: 200,
    }),
  ]);

  const overview = summarizeBudgetTransactions(transactions);
  const coveragePct = calculateMonthCoverage({
    transactionCount: overview.transactionCount,
    uncategorizedCount: overview.uncategorizedCount,
  });
  const cashOutlook = calculateDeterministicCashOutlook({
    monthKey,
    incomeCents: overview.incomeCents,
    expensesCents: overview.expensesCents,
  });
  const categoryActuals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.amountCents >= 0) {
      continue;
    }
    const current = categoryActuals.get(transaction.category) ?? 0;
    categoryActuals.set(transaction.category, current + Math.abs(transaction.amountCents));
  }

  const categories = new Set<string>([...targets.map((target) => target.category), ...categoryActuals.keys()]);
  const budgets = [...categories]
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const target = targets.find((row) => row.category === category);
      const targetCents = target?.targetCents ?? 0;
      const actualCents = categoryActuals.get(category) ?? 0;
      return {
        category,
        targetCents,
        actualCents,
        varianceCents: actualCents - targetCents,
      };
    });

  const merchantGroups = new Map<string, Date[]>();
  const merchantAmounts = new Map<string, number[]>();
  for (const transaction of allRecent) {
    if (transaction.amountCents >= 0) {
      continue;
    }
    const key = transaction.normalizedMerchant;
    merchantGroups.set(key, [...(merchantGroups.get(key) ?? []), transaction.postedAt]);
    merchantAmounts.set(key, [...(merchantAmounts.get(key) ?? []), Math.abs(transaction.amountCents)]);
  }
  const recurring: RecurringInsight[] = [];
  for (const [merchant, dates] of merchantGroups.entries()) {
    if (dates.length < 2) {
      continue;
    }
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const gapDays = Math.round((sorted[index].getTime() - sorted[index - 1].getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(gapDays);
    }
    const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    if (averageInterval < 20 || averageInterval > 45) {
      continue;
    }
    const amounts = merchantAmounts.get(merchant) ?? [];
    const averageAmountCents =
      amounts.length === 0 ? 0 : Math.round(amounts.reduce((sum, value) => sum + value, 0) / amounts.length);
    const lastDate = sorted[sorted.length - 1];
    const estimatedNext = new Date(lastDate);
    estimatedNext.setUTCDate(estimatedNext.getUTCDate() + Math.round(averageInterval));
    recurring.push({
      merchant,
      count: dates.length,
      averageAmountCents,
      estimatedNextDate: estimatedNext.toISOString().slice(0, 10),
    });
  }

  const trendMap = new Map<string, { inflowCents: number; outflowCents: number }>();
  for (const transaction of allRecent) {
    const bucket = trendMap.get(transaction.monthKey) ?? { inflowCents: 0, outflowCents: 0 };
    if (transaction.amountCents >= 0) {
      bucket.inflowCents += transaction.amountCents;
    } else {
      bucket.outflowCents += Math.abs(transaction.amountCents);
    }
    trendMap.set(transaction.monthKey, bucket);
  }
  const trends: BudgetTrendPoint[] = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({
      monthKey: month,
      inflowCents: totals.inflowCents,
      outflowCents: totals.outflowCents,
      netCents: totals.inflowCents - totals.outflowCents,
    }));

  return {
    monthKey,
    overview,
    transactions,
    budgets,
    trends,
    recurring: recurring.slice(0, 12),
    accounts,
    batches,
    pendingSuggestions,
    coveragePct,
    cashOutlook,
    categoriesWithoutTargets: [...categoryActuals.keys()].filter(
      (category) => !targets.some((target) => target.category === category),
    ),
  };
}
