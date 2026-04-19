import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();
const utilityProjectionUpsertMock = vi.fn();
const utilityProjectionDeleteMock = vi.fn();
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
    utilityProjection: {
      upsert: utilityProjectionUpsertMock,
      delete: utilityProjectionDeleteMock,
    },
    activityLog: {
      create: activityLogCreateMock,
    },
  },
}));

describe("projection actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", username: "Gabe" });
  });

  test("saveUtilityProjectionAction upserts normalized category for month", async () => {
    utilityProjectionUpsertMock.mockResolvedValue({ id: "projection-1" });
    const { saveUtilityProjectionAction } = await import("@/app/actions");

    const formData = new FormData();
    formData.set("monthKey", "2026-07");
    formData.set("category", " Hydro ");
    formData.set("planned", "123.45");
    formData.set("actual", "100.00");

    await saveUtilityProjectionAction(formData);

    expect(utilityProjectionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          monthKey_category: {
            monthKey: "2026-07",
            category: "hydro",
          },
        },
        create: expect.objectContaining({
          plannedCents: 12345,
          actualCents: 10000,
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/projections");
  });

  test("saveUtilityProjectionAction redirects on invalid amount", async () => {
    const { saveUtilityProjectionAction } = await import("@/app/actions");

    const formData = new FormData();
    formData.set("monthKey", "2026-07");
    formData.set("category", "hydro");
    formData.set("planned", "not-a-number");

    await expect(saveUtilityProjectionAction(formData)).rejects.toThrow(
      "REDIRECT:/projections?month=2026-07&error=invalid_projection_amount",
    );
  });

  test("deleteUtilityProjectionAction deletes row id and revalidates", async () => {
    utilityProjectionDeleteMock.mockResolvedValue({ id: "projection-1" });
    const { deleteUtilityProjectionAction } = await import("@/app/actions");

    const formData = new FormData();
    formData.set("projectionId", "projection-1");
    await deleteUtilityProjectionAction(formData);

    expect(utilityProjectionDeleteMock).toHaveBeenCalledWith({
      where: { id: "projection-1" },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/projections");
  });
});
