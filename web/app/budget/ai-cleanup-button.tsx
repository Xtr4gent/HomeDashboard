"use client";

import { useMemo, useRef } from "react";

import type { BudgetAiPreflight } from "@/lib/budget-ai";

type Props = {
  monthKey: string;
  preflight: BudgetAiPreflight;
  action: (formData: FormData) => Promise<void>;
};

function formatCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export function AiCleanupButton({ monthKey, preflight, action }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const disabledReason = useMemo(() => {
    if (!preflight.keyConfigured) {
      return "OPENAI_API_KEY is not configured";
    }
    if (preflight.rowsPlanned <= 0) {
      return "No uncategorized transactions to clean";
    }
    if (preflight.runsLeftToday <= 0) {
      return "Daily AI cleanup limit reached";
    }
    if (preflight.monthlyRemainingCents < preflight.estimatedLowCostCents) {
      return "Monthly AI budget cap reached";
    }
    return null;
  }, [preflight]);

  const handleOpenConfirm = () => {
    if (disabledReason) {
      return;
    }
    const confirmationText = [
      "This action uses your OPENAI_API_KEY.",
      `Model: ${preflight.model}`,
      `Rows to review: ${preflight.rowsPlanned}`,
      `Estimated cost: ${formatCents(preflight.estimatedLowCostCents)} - ${formatCents(preflight.estimatedHighCostCents)}`,
      `Remaining monthly budget: ${formatCents(preflight.monthlyRemainingCents)} of ${formatCents(preflight.monthlyBudgetCents)}`,
      "",
      "Continue?",
    ].join("\n");

    if (window.confirm(confirmationText)) {
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} action={action} className="grid gap-2 rounded-xl border border-slate-700/80 bg-slate-950/65 p-3">
      <input type="hidden" name="monthKey" value={monthKey} />
      <p className="text-xs uppercase tracking-[0.12em] text-slate-400">AI cleanup</p>
      <p className="text-xs text-slate-300">
        Uses your OpenAI API key. Rough run cost: {formatCents(preflight.estimatedLowCostCents)} -{" "}
        {formatCents(preflight.estimatedHighCostCents)}.
      </p>
      <p className="text-xs text-slate-400">
        Remaining monthly AI budget: {formatCents(preflight.monthlyRemainingCents)} / {formatCents(preflight.monthlyBudgetCents)}.
      </p>
      <button
        type="button"
        onClick={handleOpenConfirm}
        disabled={Boolean(disabledReason)}
        className="rounded-xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Clean with AI
      </button>
      {disabledReason ? <p className="text-xs text-amber-300">{disabledReason}</p> : null}
    </form>
  );
}
