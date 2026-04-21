import { prisma } from "@/lib/prisma";
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

type NormalizedImportRow = {
  postedAt: Date;
  description: string;
  amountCents: number;
};

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

export function parseCsv(content: string): ParsedCsvData {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.toLowerCase());
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));
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
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
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
}): Promise<NormalizedImportRow[]> {
  const key = aiKey();
  if (!key) {
    throw new Error("CSV headers not recognized and OPENAI_API_KEY is not configured.");
  }
  if (args.rows.length === 0) {
    return [];
  }

  const chunks: string[][][] = [];
  for (let index = 0; index < args.rows.length; index += 150) {
    chunks.push(args.rows.slice(index, index + 150));
  }

  const normalized: NormalizedImportRow[] = [];
  for (const chunk of chunks) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: aiModel(),
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
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("openai_csv_parse_empty_response");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new Error("openai_csv_parse_invalid_json");
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

  return normalized;
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
    normalizedRows = await normalizeRowsWithAi({
      headers: parsed.headers,
      rows: parsed.rows,
    });
    if (normalizedRows.length === 0) {
      throw new Error("CSV could not be normalized from this format.");
    }
  }

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
    },
  });

  let importedCount = 0;
  let duplicateCount = 0;
  for (const row of normalizedRows) {
    const postedAt = row.postedAt;
    const description = row.description;
    const amountCents = row.amountCents;
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
    importedCount += 1;
  }

  await prisma.budgetImportBatch.update({
    where: { id: batch.id },
    data: {
      importedCount,
      duplicateCount,
      status: "completed",
    },
  });

  return {
    batchId: batch.id,
    importedCount,
    duplicateCount,
    rowCount: parsed.rows.length,
  };
}

function shiftMonth(monthKey: string, offset: number): string {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getBudgetPageData(monthKey: string) {
  const [transactions, targets, accounts, batches, allRecent] = await Promise.all([
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
  ]);

  const overview = summarizeBudgetTransactions(transactions);
  const categoryActuals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.amountCents >= 0) {
      continue;
    }
    const current = categoryActuals.get(transaction.category) ?? 0;
    categoryActuals.set(transaction.category, current + Math.abs(transaction.amountCents));
  }

  const budgets = targets.map((target) => ({
    category: target.category,
    targetCents: target.targetCents,
    actualCents: categoryActuals.get(target.category) ?? 0,
    varianceCents: (categoryActuals.get(target.category) ?? 0) - target.targetCents,
  }));

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
    categoriesWithoutTargets: [...categoryActuals.keys()].filter(
      (category) => !targets.some((target) => target.category === category),
    ),
  };
}
