import { describe, expect, test } from "vitest";

import { derivePanelState } from "@/lib/panel-state";

describe("panel state derivation", () => {
  test("returns loading state first", () => {
    expect(
      derivePanelState({ isLoading: true, hasError: false, itemCount: 0, partialFailures: 0 }),
    ).toBe("loading");
  });

  test("returns empty when no items and no error", () => {
    expect(
      derivePanelState({ isLoading: false, hasError: false, itemCount: 0, partialFailures: 0 }),
    ).toBe("empty");
  });

  test("returns error when the panel fails with no data", () => {
    expect(
      derivePanelState({ isLoading: false, hasError: true, itemCount: 0, partialFailures: 0 }),
    ).toBe("error");
  });

  test("returns partial when rows load with partial failures", () => {
    expect(
      derivePanelState({ isLoading: false, hasError: true, itemCount: 3, partialFailures: 1 }),
    ).toBe("partial");
  });

  test("returns success when data is healthy", () => {
    expect(
      derivePanelState({ isLoading: false, hasError: false, itemCount: 3, partialFailures: 0 }),
    ).toBe("success");
  });
});
