import { beforeEach, describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const getSessionMock = vi.fn();
const utilityProjectionUpsertMock = vi.fn();
const upgradeProjectCreateMock = vi.fn();
const upgradeProjectUpdateMock = vi.fn();
const upgradeProjectDeleteMock = vi.fn();
const upgradePlanMonthUpsertMock = vi.fn();
const upgradeActualMonthUpsertMock = vi.fn();
const upgradePlanAggregateMock = vi.fn();
const upgradeActualAggregateMock = vi.fn();
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
    $transaction: vi.fn(async (callback: (tx: {
      utilityProjection: { upsert: typeof utilityProjectionUpsertMock };
      upgradePlanMonth: { upsert: typeof upgradePlanMonthUpsertMock };
      upgradeActualMonth: { upsert: typeof upgradeActualMonthUpsertMock };
    }) => Promise<void>) =>
      callback({
        utilityProjection: { upsert: utilityProjectionUpsertMock },
        upgradePlanMonth: { upsert: upgradePlanMonthUpsertMock },
        upgradeActualMonth: { upsert: upgradeActualMonthUpsertMock },
      })),
    utilityProjection: {
      upsert: utilityProjectionUpsertMock,
      delete: vi.fn(),
    },
    upgradeProject: {
      create: upgradeProjectCreateMock,
      update: upgradeProjectUpdateMock,
      delete: upgradeProjectDeleteMock,
    },
    upgradePlanMonth: {
      aggregate: upgradePlanAggregateMock,
    },
    upgradeActualMonth: {
      aggregate: upgradeActualAggregateMock,
    },
    activityLog: {
      create: activityLogCreateMock,
    },
  },
}));

describe("upgrades and projections actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "user-1", username: "Gabe" });
    upgradePlanAggregateMock.mockResolvedValue({ _sum: { plannedCents: 12000 } });
    upgradeActualAggregateMock.mockResolvedValue({ _sum: { actualCents: 10000 } });
    upgradeProjectUpdateMock.mockResolvedValue({ id: "project-1" });
  });

  test("seedUtilityProjectionDefaultsAction creates base categories", async () => {
    const { seedUtilityProjectionDefaultsAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("monthKey", "2026-08");

    await seedUtilityProjectionDefaultsAction(formData);

    expect(utilityProjectionUpsertMock).toHaveBeenCalledTimes(4);
    expect(revalidatePathMock).toHaveBeenCalledWith("/projections");
  });

  test("saveUpgradeProjectAction creates new project", async () => {
    const { saveUpgradeProjectAction } = await import("@/app/actions");
    upgradeProjectCreateMock.mockResolvedValue({ id: "project-1" });

    const formData = new FormData();
    formData.set("title", "Heat Pump");
    formData.set("category", "Efficiency");
    formData.set("status", "planned");
    formData.set("startMonthKey", "2026-08");
    formData.set("targetMonthKey", "2026-10");

    await saveUpgradeProjectAction(formData);

    expect(upgradeProjectCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Heat Pump",
          category: "efficiency",
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/upgrades");
  });

  test("saveUpgradePlannedMonthAction upserts monthly planned amount", async () => {
    const { saveUpgradePlannedMonthAction } = await import("@/app/actions");
    upgradePlanMonthUpsertMock.mockResolvedValue({ id: "plan-1" });

    const formData = new FormData();
    formData.set("projectId", "project-1");
    formData.set("monthKey", "2026-08");
    formData.set("planned", "500.00");

    await saveUpgradePlannedMonthAction(formData);

    expect(upgradePlanMonthUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plannedCents: 50000,
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/upgrades");
  });
});
