import { Prisma } from "@prisma/client";

import { getDashboardData } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { dateStringInTimezone, monthKeyFromDate } from "@/lib/time";

const SNAPSHOT_STALE_MS = 10 * 60 * 1000;

export type AnalyticsRecomputeTrigger = {
  sourceEventKey: string;
  triggerType: "bill_created" | "payment_marked" | "upgrade_created" | "scenario_applied";
  at?: Date;
};

export type AnalyticsTrendData = {
  points: {
    monthKey: string;
    totalMonthlyCostCents: number;
  }[];
  isStale: boolean;
  lastUpdatedAt: Date | null;
};

function buildSnapshotPayload(dashboard: Awaited<ReturnType<typeof getDashboardData>>, sourceEventKey: string) {
  const topCategory = dashboard.categoryTotals[0];

  return {
    totalMonthlyCostCents: dashboard.totalMonthlyCostCents,
    projectedYearlyCostCents: dashboard.projectedYearlyCostCents,
    utilitiesTotalCents: dashboard.utilitiesTotalCents,
    upgradesTotalCents: dashboard.upgradesTotalCents,
    paidRatePct: dashboard.paidRatePct,
    topCategory: topCategory?.category ?? null,
    topCategoryTotalCents: topCategory?.totalCents ?? null,
    sourceEventKey,
    generatedAt: new Date(),
  };
}

export async function enqueueAnalyticsRecompute(trigger: AnalyticsRecomputeTrigger): Promise<void> {
  await prisma.analyticsRecomputeJob
    .create({
      data: {
        sourceEventKey: trigger.sourceEventKey,
        triggerType: trigger.triggerType,
        queuedAt: trigger.at ?? new Date(),
      },
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    });
}

async function recomputeSnapshotsForJob(job: { sourceEventKey: string }, now: Date): Promise<void> {
  const dashboard = await getDashboardData(now);
  const dayKey = dateStringInTimezone(now);
  const monthKey = monthKeyFromDate(now);
  const payload = buildSnapshotPayload(dashboard, job.sourceEventKey);

  await prisma.$transaction(async (tx) => {
    await tx.analyticsSnapshotDaily.upsert({
      where: { dayKey },
      update: payload,
      create: {
        dayKey,
        monthKey,
        ...payload,
      },
    });

    await tx.analyticsSnapshotMonthly.upsert({
      where: { monthKey },
      update: payload,
      create: {
        monthKey,
        ...payload,
      },
    });
  });
}

async function shouldSkipStaleJob(queuedAt: Date): Promise<boolean> {
  const latest = await prisma.analyticsSnapshotMonthly.findFirst({
    orderBy: { generatedAt: "desc" },
    select: { generatedAt: true },
  });

  if (!latest) {
    return false;
  }

  return latest.generatedAt.getTime() >= queuedAt.getTime();
}

export async function processQueuedAnalyticsJobs(options?: { limit?: number }): Promise<number> {
  const limit = options?.limit ?? 5;
  const queuedJobs = await prisma.analyticsRecomputeJob.findMany({
    where: { status: "queued" },
    orderBy: { queuedAt: "asc" },
    take: limit,
  });

  let processed = 0;

  for (const queuedJob of queuedJobs) {
    const now = new Date();
    const claimed = await prisma.analyticsRecomputeJob.updateMany({
      where: { id: queuedJob.id, status: "queued" },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        startedAt: now,
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    try {
      if (await shouldSkipStaleJob(queuedJob.queuedAt)) {
        await prisma.analyticsRecomputeJob.update({
          where: { id: queuedJob.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            errorMessage: "stale trigger skipped",
          },
        });
        processed += 1;
        continue;
      }

      await recomputeSnapshotsForJob(queuedJob, now);
      await prisma.analyticsRecomputeJob.update({
        where: { id: queuedJob.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          errorMessage: null,
        },
      });
      processed += 1;
    } catch (error: unknown) {
      await prisma.analyticsRecomputeJob.update({
        where: { id: queuedJob.id },
        data: {
          status: "failed",
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown analytics error",
        },
      });
    }
  }

  return processed;
}

export async function getAnalyticsTrendData(now = new Date()): Promise<AnalyticsTrendData> {
  const points = await prisma.analyticsSnapshotMonthly.findMany({
    orderBy: { monthKey: "desc" },
    take: 12,
    select: {
      monthKey: true,
      totalMonthlyCostCents: true,
      generatedAt: true,
    },
  });

  if (points.length === 0) {
    return {
      points: [],
      isStale: true,
      lastUpdatedAt: null,
    };
  }

  const ordered = [...points].reverse();
  const lastUpdatedAt = ordered[ordered.length - 1].generatedAt;
  const isStale = now.getTime() - lastUpdatedAt.getTime() > SNAPSHOT_STALE_MS;

  return {
    points: ordered.map((point) => ({
      monthKey: point.monthKey,
      totalMonthlyCostCents: point.totalMonthlyCostCents,
    })),
    isStale,
    lastUpdatedAt,
  };
}
