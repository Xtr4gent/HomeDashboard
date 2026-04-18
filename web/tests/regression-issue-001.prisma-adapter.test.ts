import { describe, expect, test, vi } from "vitest";

// Regression: ISSUE-001 — homepage 500 from missing Prisma adapter.
// Found by /qa on 2026-04-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-18.md

const prismaCtor = vi.fn(function PrismaClientMock() {
  return { mocked: true };
});
const prismaPgCtor = vi.fn(function PrismaPgMock() {
  return { adapter: true };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: prismaCtor,
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: prismaPgCtor,
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/home_dashboard?schema=public",
  },
}));

describe("ISSUE-001 regression", () => {
  test("constructs PrismaClient with a PrismaPg adapter", async () => {
    await import("@/lib/prisma");

    expect(prismaPgCtor).toHaveBeenCalledTimes(1);
    expect(prismaCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.any(Object),
      }),
    );
  });
});
