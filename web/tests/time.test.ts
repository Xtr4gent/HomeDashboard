import { describe, expect, test } from "vitest";

import {
  buildRecurrenceRule,
  buildMonthlyRecurrenceRule,
  dateDiffInDays,
  dueDatesForMonth,
  dueDateForMonth,
  monthKeyFromDate,
  parseRecurrenceRule,
} from "@/lib/time";

describe("time helpers", () => {
  test("parses recurrence rules safely", () => {
    expect(parseRecurrenceRule("monthly_last_day")).toEqual({ kind: "monthly_last_day" });
    expect(parseRecurrenceRule("monthly_day_15")).toEqual({ kind: "monthly_day", day: 15 });
    expect(parseRecurrenceRule("semi_monthly_1_15")).toEqual({
      kind: "semi_monthly",
      firstDay: 1,
      secondDay: 15,
    });
    expect(parseRecurrenceRule("yearly_6_20")).toEqual({
      kind: "yearly",
      month: 6,
      day: 20,
    });
  });

  test("falls back to month end for short months", () => {
    expect(dueDateForMonth("monthly_day_31", 2026, 2)).toBe("2026-02-28");
    expect(dueDateForMonth("monthly_last_day", 2026, 2)).toBe("2026-02-28");
  });

  test("computes month key from timezone-safe date", () => {
    const sample = new Date("2026-04-18T12:00:00.000Z");
    expect(monthKeyFromDate(sample)).toBe("2026-04");
  });

  test("calculates due soon windows deterministically", () => {
    expect(dateDiffInDays("2026-04-10", "2026-04-17")).toBe(7);
    expect(dateDiffInDays("2026-04-10", "2026-04-19")).toBe(9);
  });

  test("builds recurrence rules from friendly inputs", () => {
    expect(buildMonthlyRecurrenceRule("monthly_last_day")).toBe("monthly_last_day");
    expect(buildMonthlyRecurrenceRule("monthly_day", 9)).toBe("monthly_day_9");
    expect(() => buildMonthlyRecurrenceRule("monthly_day", 40)).toThrowError(
      "Due day must be between 1 and 31.",
    );
    expect(buildRecurrenceRule("semi_monthly", { dueDay: 1, secondDueDay: 15 })).toBe("semi_monthly_1_15");
    expect(buildRecurrenceRule("yearly", { dueMonth: 9, dueDay: 7 })).toBe("yearly_9_7");
    expect(() => buildRecurrenceRule("semi_monthly", { dueDay: 15, secondDueDay: 15 })).toThrowError(
      "Second due day must be greater than the first due day.",
    );
    expect(() => buildRecurrenceRule("yearly", { dueMonth: 13, dueDay: 10 })).toThrowError(
      "Due month must be between 1 and 12 for yearly recurrence.",
    );
  });

  test("returns all due dates for semi-monthly and yearly rules", () => {
    expect(dueDatesForMonth("semi_monthly_15_31", 2026, 2)).toEqual(["2026-02-15", "2026-02-28"]);
    expect(dueDatesForMonth("yearly_4_18", 2026, 3)).toEqual([]);
    expect(dueDatesForMonth("yearly_4_18", 2026, 4)).toEqual(["2026-04-18"]);
    expect(dueDateForMonth("yearly_4_18", 2026, 3)).toBe("2026-03-01");
  });
});
