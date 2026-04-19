import { expect, test } from "@playwright/test";

test.describe("planner lab", () => {
  test("renders planner entry points", async ({ page }) => {
    await page.goto("/planner");
    const plannerHeading = page.getByRole("heading", { name: "Planner Lab" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(plannerHeading.or(loginHeading)).toBeVisible();
  });
});
