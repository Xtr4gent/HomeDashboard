import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

test.describe("dashboard analytics", () => {
  test("authenticated mutation refreshes snapshot trend on dashboard", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "House Ops Command Center" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly spend trend (snapshot)" })).toBeVisible();

    const uniqueBillName = `Analytics E2E ${Date.now()}`;
    await page.getByPlaceholder("Bill name").fill(uniqueBillName);
    await page.locator('select[name="category"]').first().selectOption("other");
    await page.getByPlaceholder("Amount (e.g. 145.50)").fill("123.45");
    await page.locator('select[name="recurrenceMode"]').selectOption("monthly_day");
    await page.locator('input[name="dueDay"]').fill("15");
    await page.getByRole("button", { name: "Save bill" }).click();

    const monthKey = new Date().toISOString().slice(0, 7);
    await expect(page.getByText(monthKey).first()).toBeVisible({ timeout: 15000 });
  });
});
