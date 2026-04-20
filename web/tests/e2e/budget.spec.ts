import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

test.describe("budget", () => {
  test("renders budget entry point", async ({ page }) => {
    await page.goto("/budget");
    const budgetHeading = page.getByRole("heading", { name: "Budget Ledger" });
    const loginHeading = page.getByRole("heading", { name: "HomeDashboard Login" });
    await expect(budgetHeading.or(loginHeading)).toBeVisible();
  });

  test("authenticated user can navigate budget tabs", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/budget");
    await expect(page.getByRole("heading", { name: "Budget Ledger" })).toBeVisible();
    await page.getByRole("link", { name: "Transactions" }).click();
    await expect(page.getByRole("heading", { name: /Transactions/ })).toBeVisible();
    await page.getByRole("link", { name: "Accounts" }).click();
    await expect(page.getByRole("heading", { name: "Import CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clean with AI" })).toBeVisible();
    await expect(page.getByText(/Rough run cost/i)).toBeVisible();
  });
});
