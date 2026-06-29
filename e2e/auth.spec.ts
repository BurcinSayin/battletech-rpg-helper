import { test, expect } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) with the
// 20260629145000_profiles migration applied, and email confirmations disabled.

test("guards dashboard, then sign up and sign out", async ({ page }) => {
  // Anonymous access to a protected route redirects to login.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  // Sign up with a unique email — confirmations are off, so this establishes a
  // session immediately and lands on the dashboard.
  const email = `e2e+${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email)).toBeVisible();

  // Sign out, then the guard kicks in again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
