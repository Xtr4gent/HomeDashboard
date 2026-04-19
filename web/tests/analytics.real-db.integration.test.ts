import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  enqueueAnalyticsRecompute,
  processQueuedAnalyticsJobs,
} from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

const runRealDbIntegration = process.env.RUN_REAL_DB_INTEGRATION === "true";

describe.runIf(runRealDbIntegration)("analytics recompute (real DB)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.analyticsRecomputeJob.deleteMany({
      where: {
        triggerType: { startsWith: "test_" },
      },
    });
    await prisma.analyticsSnapshotDaily.deleteMany();
    await prisma.analyticsSnapshotMonthly.deleteMany();
  });

  test("deduplicates identical sourceEventKey triggers", async () => {
    const sourceEventKey = `analytics-test-dup-${Date.now()}`;
    await enqueueAnalyticsRecompute({
      sourceEventKey,
      triggerType: "bill_created",
    });
    await enqueueAnalyticsRecompute({
      sourceEventKey,
      triggerType: "bill_created",
    });

    const jobs = await prisma.analyticsRecomputeJob.findMany({
      where: { sourceEventKey },
    });
    expect(jobs).toHaveLength(1);
  });

  test("processes queued jobs and writes typed snapshots", async () => {
    const sourceEventKey = `analytics-test-process-${Date.now()}`;
    await prisma.analyticsRecomputeJob.create({
      data: {
        sourceEventKey,
        triggerType: "test_process",
      },
    });

    const processed = await processQueuedAnalyticsJobs({ limit: 5 });
    expect(processed).toBeGreaterThan(0);

    const completedJob = await prisma.analyticsRecomputeJob.findUnique({
      where: { sourceEventKey },
    });
    expect(completedJob?.status).toBe("completed");

    const dailyCount = await prisma.analyticsSnapshotDaily.count();
    const monthlyCount = await prisma.analyticsSnapshotMonthly.count();
    expect(dailyCount).toBeGreaterThan(0);
    expect(monthlyCount).toBeGreaterThan(0);
  });

  test("skips stale jobs when fresher snapshots already exist", async () => {
    const sourceEventKey = `analytics-test-stale-${Date.now()}`;

    await prisma.analyticsSnapshotMonthly.create({
      data: {
        monthKey: "2099-12",
        totalMonthlyCostCents: 10000,
        projectedYearlyCostCents: 120000,
        utilitiesTotalCents: 3000,
        upgradesTotalCents: 2000,
        paidRatePct: 90,
        topCategory: "utility",
        topCategoryTotalCents: 3000,
        sourceEventKey: "seed-fresh-snapshot",
      },
    });

    await prisma.analyticsRecomputeJob.create({
      data: {
        sourceEventKey,
        triggerType: "test_stale",
        queuedAt: new Date("2001-01-01T00:00:00.000Z"),
      },
    });

    await processQueuedAnalyticsJobs({ limit: 5 });

    const staleJob = await prisma.analyticsRecomputeJob.findUnique({
      where: { sourceEventKey },
      select: { status: true, errorMessage: true },
    });
    expect(staleJob?.status).toBe("completed");
    expect(staleJob?.errorMessage).toContain("stale trigger skipped");
  });
});
