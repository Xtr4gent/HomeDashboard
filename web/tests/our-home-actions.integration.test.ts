import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});
const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();
const upsertSnapshotMock = vi.fn();
const activityLogCreateMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  clearSession: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/user-auth", () => ({
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  enqueueAnalyticsRecompute: vi.fn().mockResolvedValue(undefined),
  processQueuedAnalyticsJobs: vi.fn().mockResolvedValue(0),
  getAnalyticsTrendData: vi.fn().mockResolvedValue({ points: [], isStale: true, lastUpdatedAt: null }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    homeProfileSnapshot: {
      upsert: upsertSnapshotMock,
    },
    activityLog: {
      create: activityLogCreateMock,
    },
  },
}));

describe("our-home actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", username: "Gabe" });
    upsertSnapshotMock.mockResolvedValue({ id: "snapshot-1" });
    activityLogCreateMock.mockResolvedValue({ id: "log-1" });
  });

  test("saveHomeProfileSnapshotAction saves snapshot and redirects with success", async () => {
    const { saveHomeProfileSnapshotAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-04");
    formData.set("propertyAddress", "123 Main St, Toronto, ON");
    formData.set("semiMonthlyPayment", "1250.55");
    formData.set("mortgageInterestRatePct", "4.875");
    formData.set("mortgageTermYears", "5");
    formData.set("mortgageTermStartMonthKey", "2026-01");
    formData.set("mortgageLender", "ABC Bank");
    formData.set("mortgageNotes", "Renewal in 2030");
    formData.set("propertyTaxYearly", "6500");
    formData.set("waterMonthly", "62.25");
    formData.set("gasMonthly", "71.40");
    formData.set("hydroMonthly", "118.90");

    await expect(saveHomeProfileSnapshotAction(formData)).rejects.toThrow(
      "REDIRECT:/planner?month=2026-04&success=home_profile_saved",
    );

    expect(upsertSnapshotMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/planner");
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
  });

  test("saveHomeProfileSnapshotAction rejects invalid input", async () => {
    const { saveHomeProfileSnapshotAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "bad-month");
    formData.set("propertyAddress", "");

    await expect(saveHomeProfileSnapshotAction(formData)).rejects.toThrow(
      "REDIRECT:/planner?error=invalid_home_profile_input",
    );
    expect(upsertSnapshotMock).not.toHaveBeenCalled();
  });
});
