import { expect, test } from "@playwright/test";

test("renders login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "HomeDashboard Login" })).toBeVisible();
});
