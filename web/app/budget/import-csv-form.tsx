"use client";

import { useFormStatus } from "react-dom";

type Props = {
  monthKey: string;
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <div className="grid gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Importing transactions..." : "Import transactions"}
      </button>
      {pending ? (
        <div className="h-1 overflow-hidden rounded-full bg-slate-800/80">
          <div className="h-full w-1/3 animate-[pulse_900ms_ease-in-out_infinite] rounded-full bg-cyan-300" />
        </div>
      ) : null}
    </div>
  );
}

export function ImportCsvForm({ monthKey, action }: Props) {
  return (
    <form action={action} className="mt-3 grid gap-2">
      <input type="hidden" name="monthKey" value={monthKey} />
      <input
        name="accountName"
        placeholder="Account name (Joint Chequing)"
        defaultValue="Joint Chequing"
        className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
      />
      <input
        name="institution"
        placeholder="Institution (optional)"
        className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-100 focus:border-cyan-300 focus:outline-none"
      />
      <input
        type="file"
        name="csvFile"
        accept=".csv,text/csv"
        className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
      />
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" name="autoCategorize" defaultChecked className="h-4 w-4 accent-cyan-300" />
        Auto-categorize uncategorized rows after import using AI
      </label>
      <SubmitButton />
    </form>
  );
}
