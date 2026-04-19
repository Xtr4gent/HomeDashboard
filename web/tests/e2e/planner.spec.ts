import { expect, test } from "@playwright/test";

test.describe("planner lab", () => {
  test("renders planner entry points", async ({ page }) => {
    await page.goto("/planner");
    const plannerHeading = page.getByRole("heading", { name: "Planner Lab" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(plannerHeading.or(loginHeading)).toBeVisible();
  });

  test("shows planner save/apply controls when authenticated", async ({ page }) => {
    await page.goto("/planner");

    const plannerHeading = page.getByRole("heading", { name: "Planner Lab" });
    if (await plannerHeading.isVisible()) {
      await expect(page.getByRole("button", { name: "Save draft scenario" })).toBeVisible();
      const applyButtons = page.getByText("Apply to dashboard");
      if ((await applyButtons.count()) > 0) {
        await expect(applyButtons.first()).toBeVisible();
      } else {
        await expect(page.getByText("No scenarios yet. Save one to start comparing options.")).toBeVisible();
      }
      return;
    }

    await expect(page.getByRole("heading", { name: "HomeDashboard Login" })).toBeVisible();
  });
});
