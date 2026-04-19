import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

test.describe("projections", () => {
  test("renders projections entry point", async ({ page }) => {
    await page.goto("/projections");
    const projectionsHeading = page.getByRole("heading", { name: "Utility Projections" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(projectionsHeading.or(loginHeading)).toBeVisible();
  });

  test("authenticated user can add a custom utility projection category", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/projections");
    await expect(page.getByRole("heading", { name: "Utility Projections" })).toBeVisible();

    const uniqueCategory = `summer-hydro-${Date.now()}`;
    await page.getByPlaceholder("hydro, gas, water...").fill(uniqueCategory);
    await page.getByPlaceholder("0.00").first().fill("275.50");
    await page.getByPlaceholder("0.00").nth(1).fill("301.40");
    await page.getByRole("button", { name: "Add / update category" }).click();

    await expect(page.getByDisplayValue(uniqueCategory)).toBeVisible();
    await expect(page.getByText("$25.90")).toBeVisible();
  });
});
