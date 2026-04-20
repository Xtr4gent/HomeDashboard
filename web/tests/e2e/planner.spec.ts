import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

test.describe("our home", () => {
  test("renders Our Home entry point", async ({ page }) => {
    await page.goto("/planner");
    const plannerHeading = page.getByRole("heading", { name: "Home Financial Snapshot" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(plannerHeading.or(loginHeading)).toBeVisible();
  });

  test("shows Our Home save controls when authenticated", async ({ page }) => {
    await page.goto("/planner");

    const plannerHeading = page.getByRole("heading", { name: "Home Financial Snapshot" });
    if (await plannerHeading.isVisible()) {
      await expect(page.getByRole("button", { name: "Save Our Home snapshot" })).toBeVisible();
      await expect(page.getByText(/Monthly property tax equivalent/i)).toBeVisible();
      return;
    }

    await expect(page.getByRole("heading", { name: "HomeDashboard Login" })).toBeVisible();
  });

  test("authenticated user can save Our Home snapshot", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/planner");
    await expect(page.getByRole("heading", { name: "Home Financial Snapshot" })).toBeVisible();
    await page.getByLabel("Property address").fill("456 Maple Ave, Ottawa, ON");
    await page.getByLabel("Mortgage payment (semi-monthly)").fill("1320.45");
    await page.getByLabel("Property tax (yearly total)").fill("7200.00");
    await page.getByLabel("Water (monthly)").fill("54.25");
    await page.getByLabel("Gas (monthly)").fill("73.10");
    await page.getByLabel("Hydro (monthly)").fill("121.80");
    await page.getByRole("button", { name: "Save Our Home snapshot" }).click();
    await expect(page.getByText("Our Home snapshot saved successfully.")).toBeVisible();
  });
});
