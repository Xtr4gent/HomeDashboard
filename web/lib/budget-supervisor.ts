import { env } from "@/lib/env";
import { calculateDeterministicCashOutlook, calculateMonthCoverage, getBudgetPageData } from "@/lib/budget";

type SupervisorIntent =
  | "monthly_summary"
  | "unknown_merchants_review"
  | "cash_outlook"
  | "subscriptions_review"
  | "change_preview";

export type SupervisorResult = {
  intent: SupervisorIntent;
  title: string;
  summary: string;
  assumptions: string[];
  proposedActions: string[];
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
            "Classify intent for a supervised household finance assistant. Return JSON with {\"intent\": \"monthly_summary|unknown_merchants_review|cash_outlook|subscriptions_review|change_preview\"}.",
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

export async function runBudgetSupervisorTask(args: {
  monthKey: string;
  request: string;
}): Promise<SupervisorResult> {
  const budgetData = await getBudgetPageData(args.monthKey);
  const fallbackIntent = detectIntentDeterministically(args.request);
  const modelIntent = await detectIntentWithRouterModel(args.request).catch(() => null);
  const intent = modelIntent ?? fallbackIntent;

  const baseCoverage = calculateMonthCoverage({
    transactionCount: budgetData.overview.transactionCount,
    uncategorizedCount: budgetData.overview.uncategorizedCount,
  });
  const cashOutlook = calculateDeterministicCashOutlook({
    monthKey: args.monthKey,
    incomeCents: budgetData.overview.incomeCents,
    expensesCents: budgetData.overview.expensesCents,
  });

  if (intent === "unknown_merchants_review") {
    const deterministicSummary = `${budgetData.pendingSuggestions.length} pending review items and ${budgetData.overview.uncategorizedCount} uncategorized transactions are waiting for manual approval.`;
    return {
      intent,
      title: "Review unknown merchants",
      summary: await maybeRenderNaturalSummary({
        intent,
        deterministicSummary,
        assumptions: [
          `Coverage is ${baseCoverage}% for ${args.monthKey}.`,
          "No category changes are applied automatically.",
        ],
      }),
      assumptions: [`Coverage is ${baseCoverage}% for ${args.monthKey}.`, "No category changes are applied automatically."],
      proposedActions: [
        "Open Review tab and approve high-confidence category suggestions first.",
        "Dismiss uncertain suggestions lacking clear merchant evidence.",
      ],
    };
  }

  if (intent === "cash_outlook") {
    const deterministicSummary = `Known net for ${args.monthKey} is ${(cashOutlook.knownNetCents / 100).toFixed(2)} CAD, projected month-end net is ${(cashOutlook.projectedMonthEndNetCents / 100).toFixed(2)} CAD.`;
    return {
      intent,
      title: "Cash outlook",
      summary: await maybeRenderNaturalSummary({
        intent,
        deterministicSummary,
        assumptions: cashOutlook.assumptions,
      }),
      assumptions: cashOutlook.assumptions,
      proposedActions: [
        "Review any large uncategorized expenses before acting on projection.",
        "Re-run after latest account CSV uploads for better confidence.",
      ],
    };
  }

  if (intent === "subscriptions_review") {
    const recurringCount = budgetData.recurring.length;
    const deterministicSummary = `Detected ${recurringCount} recurring spending signals. These are patterns, not confirmed subscriptions.`;
    return {
      intent,
      title: "Subscription and recurring review",
      summary: await maybeRenderNaturalSummary({
        intent,
        deterministicSummary,
        assumptions: [
          "Recurring detection uses deterministic interval heuristics from imported history.",
          "Confirmation still requires manual review.",
        ],
      }),
      assumptions: [
        "Recurring detection uses deterministic interval heuristics from imported history.",
        "Confirmation still requires manual review.",
      ],
      proposedActions: [
        "Inspect recurring list and confirm only services with clear merchant consistency.",
        "Flag uncertain merchants for manual follow-up before creating rules.",
      ],
    };
  }

  if (intent === "change_preview") {
    const deterministicSummary = `${budgetData.pendingSuggestions.length} pending proposals are available. No permanent edits happen until you approve each item.`;
    return {
      intent,
      title: "Pending change preview",
      summary: await maybeRenderNaturalSummary({
        intent,
        deterministicSummary,
        assumptions: ["Approval gateway is enforced on all suggested ledger mutations."],
      }),
      assumptions: ["Approval gateway is enforced on all suggested ledger mutations."],
      proposedActions: [
        "Approve proposals one by one in Review tab.",
        "Use dismissed status for suggestions that do not match source evidence.",
      ],
    };
  }

  const deterministicSummary = `For ${args.monthKey}: income ${(budgetData.overview.incomeCents / 100).toFixed(2)} CAD, expenses ${(budgetData.overview.expensesCents / 100).toFixed(2)} CAD, net ${(budgetData.overview.netCents / 100).toFixed(2)} CAD, coverage ${baseCoverage}%.`;
  return {
    intent: "monthly_summary",
    title: "Monthly supervised summary",
    summary: await maybeRenderNaturalSummary({
      intent: "monthly_summary",
      deterministicSummary,
      assumptions: [
        `${budgetData.overview.uncategorizedCount} transactions remain uncategorized.`,
        `${budgetData.pendingSuggestions.length} proposals remain pending approval.`,
      ],
    }),
    assumptions: [
      `${budgetData.overview.uncategorizedCount} transactions remain uncategorized.`,
      `${budgetData.pendingSuggestions.length} proposals remain pending approval.`,
    ],
    proposedActions: [
      "Clear review queue to improve summary confidence.",
      "Re-import missing account CSV files if this month is incomplete.",
    ],
  };
}
