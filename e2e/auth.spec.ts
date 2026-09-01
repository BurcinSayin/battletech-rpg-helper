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
  // The header hides the email below the `sm` breakpoint — `hidden sm:inline` in
  // components/layout/app-header.tsx:21 — so a bare toBeVisible() here is a
  // desktop-only assertion that fails under the pixel5 project. Assert the
  // responsive behaviour in both directions instead; the session itself is proven
  // by landing on /dashboard and by the Sign out control below.
  const signedInEmail = page.getByText(email);
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    await expect(signedInEmail).toBeVisible();
  } else {
    await expect(signedInEmail).toBeHidden();
  }

  // Sign out, then the guard kicks in again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
