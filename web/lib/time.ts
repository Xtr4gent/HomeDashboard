import { env } from "@/lib/env";

export type ParsedRecurrence =
  | { kind: "monthly_day"; day: number }
  | { kind: "monthly_last_day" }
  | { kind: "semi_monthly"; firstDay: number; secondDay: number }
  | { kind: "yearly"; month: number; day: number };

export type MonthlyRecurrenceMode = "monthly_day" | "monthly_last_day";
export type RecurrenceMode = MonthlyRecurrenceMode | "semi_monthly" | "yearly";

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

  if (rule.startsWith("semi_monthly_")) {
    const match = /^semi_monthly_(\d{1,2})_(\d{1,2})$/.exec(rule);
    const firstDay = Number(match?.[1]);
    const secondDay = Number(match?.[2]);
    if (
      Number.isInteger(firstDay) &&
      Number.isInteger(secondDay) &&
      firstDay >= 1 &&
      firstDay <= 31 &&
      secondDay >= 1 &&
      secondDay <= 31 &&
      firstDay < secondDay
    ) {
      return { kind: "semi_monthly", firstDay, secondDay };
    }
  }

  if (rule.startsWith("yearly_")) {
    const [, monthRaw, dayRaw] = rule.split("_");
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31) {
      return { kind: "yearly", month, day };
    }
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
  return buildRecurrenceRule(mode, { dueDay });
}

export function buildRecurrenceRule(
  mode: RecurrenceMode,
  options?: { dueDay?: number; secondDueDay?: number; dueMonth?: number },
): string {
  if (mode === "monthly_last_day") {
    return "monthly_last_day";
  }

  const parsedDay = Number(options?.dueDay);
  if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
    throw new Error("Due day must be between 1 and 31.");
  }

  if (mode === "monthly_day") {
    return `monthly_day_${parsedDay}`;
  }

  if (mode === "semi_monthly") {
    const parsedSecond = Number(options?.secondDueDay);
    if (!Number.isInteger(parsedSecond) || parsedSecond < 1 || parsedSecond > 31) {
      throw new Error("Second due day must be between 1 and 31 for semi-monthly recurrence.");
    }
    if (parsedSecond <= parsedDay) {
      throw new Error("Second due day must be greater than the first due day.");
    }
    return `semi_monthly_${parsedDay}_${parsedSecond}`;
  }

  if (mode === "yearly") {
    const parsedMonth = Number(options?.dueMonth);
    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      throw new Error("Due month must be between 1 and 12 for yearly recurrence.");
    }
    return `yearly_${parsedMonth}_${parsedDay}`;
  }

  throw new Error(`Unsupported recurrence mode: ${mode}`);
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
  const dueDates = dueDatesForMonth(rule, year, month);
  if (dueDates.length > 0) {
    return dueDates[0];
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function dueDatesForMonth(rule: string, year: number, month: number): string[] {
  const parsed = parseRecurrenceRule(rule);
  const maxDay = daysInMonth(year, month);
  const monthLabel = String(month).padStart(2, "0");

  if (parsed.kind === "monthly_last_day") {
    return [`${year}-${monthLabel}-${String(maxDay).padStart(2, "0")}`];
  }

  if (parsed.kind === "monthly_day") {
    return [`${year}-${monthLabel}-${String(Math.min(parsed.day, maxDay)).padStart(2, "0")}`];
  }

  if (parsed.kind === "semi_monthly") {
    const firstDay = Math.min(parsed.firstDay, maxDay);
    const secondDay = Math.min(parsed.secondDay, maxDay);
    const uniqueDays = [...new Set([firstDay, secondDay])].sort((a, b) => a - b);
    return uniqueDays.map((day) => `${year}-${monthLabel}-${String(day).padStart(2, "0")}`);
  }

  if (parsed.kind === "yearly") {
    if (parsed.month !== month) {
      return [];
    }
    const day = Math.min(parsed.day, maxDay);
    return [`${year}-${monthLabel}-${String(day).padStart(2, "0")}`];
  }

  return [];
}

export function dateDiffInDays(fromDateString: string, toDateString: string): number {
  const from = Date.parse(`${fromDateString}T00:00:00Z`);
  const to = Date.parse(`${toDateString}T00:00:00Z`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}
