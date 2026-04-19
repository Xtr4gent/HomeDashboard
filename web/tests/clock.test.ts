import { afterEach, describe, expect, test } from "vitest";

import { getClock, resetClockForTests, setClockForTests } from "@/lib/clock";

describe("clock test helpers", () => {
  afterEach(() => {
    resetClockForTests();
  });

  test("allows deterministic override and reset inside tests", () => {
    const fixedNow = new Date("2026-04-20T10:00:00.000Z");
    setClockForTests({ now: () => fixedNow });
    expect(getClock().now()).toEqual(fixedNow);

    resetClockForTests();
    expect(getClock().now()).toBeInstanceOf(Date);
    expect(getClock().now().toISOString()).not.toEqual(fixedNow.toISOString());
  });

  test("rejects overrides outside NODE_ENV=test", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      expect(() => setClockForTests({ now: () => new Date() })).toThrowError(
        "Clock overrides are test-only and unavailable outside NODE_ENV=test.",
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
