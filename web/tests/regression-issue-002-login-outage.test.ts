import { describe, expect, test, vi } from "vitest";

// Regression: ISSUE-002 — login form submission crashed on DB outage.
// Found by /qa on 2026-04-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-18.md

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const authenticateUserMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/user-auth", () => ({
  authenticateUser: authenticateUserMock,
}));

describe("ISSUE-002 regression", () => {
  test("redirects to auth_unavailable when auth backend throws", async () => {
    authenticateUserMock.mockRejectedValueOnce(new Error("db unavailable"));

    const { loginAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("username", "Gabe");
    formData.set("password", "bad");

    await expect(
      loginAction(formData),
    ).rejects.toThrow("REDIRECT:/login?error=auth_unavailable");
  });
});
