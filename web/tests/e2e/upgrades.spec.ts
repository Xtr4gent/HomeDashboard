import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

test.describe("upgrades", () => {
  test("renders upgrades entry point", async ({ page }) => {
    await page.goto("/upgrades");
    const upgradesHeading = page.getByRole("heading", { name: "Home Upgrades" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(upgradesHeading.or(loginHeading)).toBeVisible();
  });

  test("authenticated user can add upgrade project", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/upgrades");
    await expect(page.getByRole("heading", { name: "Home Upgrades" })).toBeVisible();

    const uniqueTitle = `Heat pump ${Date.now()}`;
    await page.getByPlaceholder("Basement insulation").fill(uniqueTitle);
    await page.getByPlaceholder("efficiency, safety...").fill("efficiency");
    await page.getByRole("button", { name: "Add project" }).click();

    await expect(page.getByDisplayValue(uniqueTitle)).toBeVisible();
  });
});
