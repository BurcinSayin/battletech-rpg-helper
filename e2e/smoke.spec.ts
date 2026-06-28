import { test, expect } from "@playwright/test";

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "BattleTech RPG Helper" }),
  ).toBeVisible();
});
