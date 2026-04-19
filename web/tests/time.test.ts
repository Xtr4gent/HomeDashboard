import { describe, expect, test } from "vitest";

import {
  buildMonthlyRecurrenceRule,
  dateDiffInDays,
  dueDateForMonth,
  monthKeyFromDate,
  parseRecurrenceRule,
} from "@/lib/time";

describe("time helpers", () => {
  test("parses recurrence rules safely", () => {
    expect(parseRecurrenceRule("monthly_last_day")).toEqual({ kind: "monthly_last_day" });
    expect(parseRecurrenceRule("monthly_day_15")).toEqual({ kind: "monthly_day", day: 15 });
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
      "Due day must be between 1 and 31 for monthly day recurrence.",
    );
  });
});
