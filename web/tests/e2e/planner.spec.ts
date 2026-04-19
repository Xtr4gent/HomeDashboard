import { expect, test } from "@playwright/test";

const e2eUsername = process.env.E2E_AUTH_USERNAME;
const e2ePassword = process.env.E2E_AUTH_PASSWORD;
const canRunAuthenticatedE2E = Boolean(e2eUsername && e2ePassword);

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

  test("authenticated user can save + apply scenario and see dashboard bill count increase", async ({ page }) => {
    test.skip(!canRunAuthenticatedE2E, "Set E2E_AUTH_USERNAME and E2E_AUTH_PASSWORD to run.");

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(e2eUsername!);
    await page.getByPlaceholder("Password").fill(e2ePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "House Ops Command Center" })).toBeVisible();
    const recurringCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Recurring Bills" }) })
      .first();
    const beforeCount = await recurringCard.getByRole("button", { name: /Mark paid|Paid/ }).count();

    await page.goto("/planner");
    await expect(page.getByRole("heading", { name: "Planner Lab" })).toBeVisible();

    const uniqueName = `E2E Planner ${Date.now()}`;
    await page.getByLabel("Scenario name").fill(uniqueName);
    await page.getByLabel("Other monthly").fill("937.41");
    await page.getByRole("button", { name: "Save draft scenario" }).click();

    await expect(page.getByText("Planner action completed successfully.")).toBeVisible();

    const scenarioCard = page.locator("li").filter({ hasText: uniqueName }).first();
    await expect(scenarioCard).toBeVisible();
    await scenarioCard.getByRole("button", { name: "Apply to dashboard" }).click();
    await expect(page.getByText("Planner action completed successfully.")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "House Ops Command Center" })).toBeVisible();
    const afterCount = await recurringCard.getByRole("button", { name: /Mark paid|Paid/ }).count();
    expect(afterCount).toBeGreaterThan(beforeCount);
  });
});
