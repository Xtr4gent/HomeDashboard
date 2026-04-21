import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  approveCategorizationBatch,
  compareDebtPaydownVsInvesting,
  getCashPosition,
  getMonthlySummary,
  listUnreviewedImports,
  proposeCategorization,
  type SupervisorToolResult,
} from "@/lib/budget-supervisor-tools";

type SupervisorIntent =
  | "monthly_summary"
  | "unknown_merchants_review"
  | "cash_outlook"
  | "debt_advice"
  | "subscriptions_review"
  | "change_preview";

export type SupervisorResult = {
  sessionId: string;
  intent: SupervisorIntent;
  title: string;
  summary: string;
  assumptions: string[];
  proposedActions: string[];
  toolName: string;
  sourceOfTruthUsed: string[];
  rubric: {
    dataFidelity: 0 | 1 | 2;
    scopeDiscipline: 0 | 1 | 2;
    explainability: 0 | 1 | 2;
    approvalSafety: 0 | 1 | 2;
    uncertaintyHandling: 0 | 1 | 2;
    costDiscipline: 0 | 1 | 2;
    total: number;
    pass: boolean;
  };
};

function maskSensitiveText(raw: string): string {
  return raw.replace(/\b\d{6,}\b/g, "[masked]");
}

function detectIntentDeterministically(request: string): SupervisorIntent {
  const normalized = request.toLowerCase();
  if (normalized.includes("unknown") || normalized.includes("review queue") || normalized.includes("categor")) {
    return "unknown_merchants_review";
  }
  if (normalized.includes("cash") || normalized.includes("payday") || normalized.includes("outlook")) {
    return "cash_outlook";
  }
  if (normalized.includes("debt") || normalized.includes("apr") || normalized.includes("invest")) {
    return "debt_advice";
  }
  if (normalized.includes("subscription") || normalized.includes("recurring")) {
    return "subscriptions_review";
  }
  if (normalized.includes("approve") || normalized.includes("change") || normalized.includes("propose")) {
    return "change_preview";
  }
  return "monthly_summary";
}

async function detectIntentWithRouterModel(request: string): Promise<SupervisorIntent | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL_ROUTER,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Classify intent for a supervised household finance assistant. Return JSON with {\"intent\": \"monthly_summary|unknown_merchants_review|cash_outlook|debt_advice|subscriptions_review|change_preview\"}.",
        },
        {
          role: "user",
          content: JSON.stringify({ request: maskSensitiveText(request) }),
        },
      ],
    }),
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    const parsed = JSON.parse(content) as { intent?: string };
    const candidate = parsed.intent;
    if (
      candidate === "monthly_summary" ||
      candidate === "unknown_merchants_review" ||
      candidate === "cash_outlook" ||
      candidate === "debt_advice" ||
      candidate === "subscriptions_review" ||
      candidate === "change_preview"
    ) {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

async function maybeRenderNaturalSummary(args: {
  intent: SupervisorIntent;
  deterministicSummary: string;
  assumptions: string[];
}): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    return args.deterministicSummary;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL_SUPERVISOR,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Rewrite deterministic finance output into plain English. Keep it concise, grounded in provided facts, and explicitly mention uncertainty assumptions. Return JSON with {\"summary\": string}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            intent: args.intent,
            deterministicSummary: maskSensitiveText(args.deterministicSummary),
            assumptions: args.assumptions,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    return args.deterministicSummary;
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return args.deterministicSummary;
  }
  try {
    const parsed = JSON.parse(content) as { summary?: string };
    return typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : args.deterministicSummary;
  } catch {
    return args.deterministicSummary;
  }
}

async function ensureSession(args: {
  sessionId?: string;
  actorUsername: string;
  monthKey: string;
}): Promise<{ id: string; history: Array<{ role: "user" | "assistant"; content: string }> }> {
  const existing = args.sessionId
    ? await prisma.budgetSupervisorSession.findUnique({
        where: { id: args.sessionId },
      })
    : null;
  if (existing && existing.actorUsername === args.actorUsername && existing.monthKey === args.monthKey) {
    const history = Array.isArray(existing.historyJson) ? (existing.historyJson as Array<{ role: "user" | "assistant"; content: string }>) : [];
    return { id: existing.id, history };
  }
  const created = await prisma.budgetSupervisorSession.create({
    data: {
      actorUsername: args.actorUsername,
      monthKey: args.monthKey,
      historyJson: [],
    },
  });
  return { id: created.id, history: [] };
}

function scoreRubric(args: { confidence: "high" | "medium" | "low"; assumptionsCount: number }) {
  const dataFidelity: 0 | 1 | 2 = args.confidence === "low" ? 1 : 2;
  const scopeDiscipline: 0 | 1 | 2 = 2;
  const explainability: 0 | 1 | 2 = args.assumptionsCount > 0 ? 2 : 1;
  const approvalSafety: 0 | 1 | 2 = 2;
  const uncertaintyHandling: 0 | 1 | 2 = args.assumptionsCount > 0 ? 2 : 1;
  const costDiscipline: 0 | 1 | 2 = 2;
  const total =
    dataFidelity +
    scopeDiscipline +
    explainability +
    approvalSafety +
    uncertaintyHandling +
    costDiscipline;
  return {
    dataFidelity,
    scopeDiscipline,
    explainability,
    approvalSafety,
    uncertaintyHandling,
    costDiscipline,
    total,
    pass: total >= 10 && dataFidelity >= 2 && approvalSafety >= 2,
  };
}

export async function runBudgetSupervisorTask(args: {
  monthKey: string;
  request: string;
  actorUsername: string;
  sessionId?: string;
}): Promise<SupervisorResult> {
  const session = await ensureSession({
    sessionId: args.sessionId,
    actorUsername: args.actorUsername,
    monthKey: args.monthKey,
  });
  const fallbackIntent = detectIntentDeterministically(args.request);
  const modelIntent = await detectIntentWithRouterModel(args.request).catch(() => null);
  const intent = modelIntent ?? fallbackIntent;

  let toolResult: SupervisorToolResult;
  let title = "Monthly supervised summary";
  if (intent === "unknown_merchants_review") {
    toolResult = await proposeCategorization(args.monthKey);
    title = "Review unknown merchants";
  } else if (intent === "cash_outlook") {
    toolResult = await getCashPosition(args.monthKey);
    title = "Cash outlook";
  } else if (intent === "debt_advice") {
    toolResult = await compareDebtPaydownVsInvesting(args.monthKey);
    title = "Debt and APR guidance";
  } else if (intent === "subscriptions_review") {
    toolResult = await listUnreviewedImports(args.monthKey);
    title = "Subscription and recurring review";
  } else if (intent === "change_preview") {
    toolResult = await approveCategorizationBatch(args.monthKey);
    title = "Pending change preview";
  } else {
    toolResult = await getMonthlySummary(args.monthKey);
  }

  const summary = await maybeRenderNaturalSummary({
    intent,
    deterministicSummary: toolResult.summary,
    assumptions: toolResult.assumptions,
  });
  const rubric = scoreRubric({
    confidence: toolResult.confidence,
    assumptionsCount: toolResult.assumptions.length,
  });
  const history = [...session.history, { role: "user", content: args.request }, { role: "assistant", content: summary }].slice(-20);
  await prisma.budgetSupervisorSession.update({
    where: { id: session.id },
    data: {
      lastUserMessage: args.request.slice(0, 800),
      lastAssistantReply: summary.slice(0, 2400),
      historyJson: history,
    },
  });

  return {
    sessionId: session.id,
    intent,
    title,
    summary,
    assumptions: toolResult.assumptions,
    proposedActions: toolResult.proposedActions,
    toolName: toolResult.toolName,
    sourceOfTruthUsed: toolResult.sourceOfTruthUsed,
    rubric,
  };
}
