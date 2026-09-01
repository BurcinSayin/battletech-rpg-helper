import { test, expect } from "@playwright/test";

test("root routes to the dashboard, which guards guests to login", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
