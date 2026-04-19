import { env } from "@/lib/env";

export type ParsedRecurrence =
  | { kind: "monthly_day"; day: number }
  | { kind: "monthly_last_day" };

export type MonthlyRecurrenceMode = "monthly_day" | "monthly_last_day";

const tzFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: env.APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseParts(sourceDate: Date): { year: number; month: number; day: number } {
  const parts = tzFormatter.formatToParts(sourceDate);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!year || !month || !day) {
    throw new Error("Failed to parse date parts for configured timezone.");
  }

  return { year, month, day };
}

export function parseRecurrenceRule(rule: string): ParsedRecurrence {
  if (rule === "monthly_last_day") {
    return { kind: "monthly_last_day" };
  }

  if (rule.startsWith("monthly_day_")) {
    const day = Number(rule.replace("monthly_day_", ""));
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      return { kind: "monthly_day", day };
    }
  }

  throw new Error(`Invalid recurrence rule: ${rule}`);
}

export function buildMonthlyRecurrenceRule(mode: MonthlyRecurrenceMode, dueDay?: number): string {
  if (mode === "monthly_last_day") {
    return "monthly_last_day";
  }

  const parsedDay = Number(dueDay);
  if (Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
    return `monthly_day_${parsedDay}`;
  }

  throw new Error("Due day must be between 1 and 31 for monthly day recurrence.");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKeyFromDate(inputDate: Date): string {
  const { year, month } = parseParts(inputDate);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function dateStringInTimezone(inputDate: Date): string {
  const { year, month, day } = parseParts(inputDate);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dueDateForMonth(rule: string, year: number, month: number): string {
  const parsed = parseRecurrenceRule(rule);
  const maxDay = daysInMonth(year, month);
  const day = parsed.kind === "monthly_last_day" ? maxDay : Math.min(parsed.day, maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateDiffInDays(fromDateString: string, toDateString: string): number {
  const from = Date.parse(`${fromDateString}T00:00:00Z`);
  const to = Date.parse(`${toDateString}T00:00:00Z`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}
