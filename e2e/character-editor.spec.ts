import { test, expect } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) with the init
// migration applied and email confirmations disabled, so signup yields a session.

test("create → edit → save → persist", async ({ page }) => {
  // Sign up (confirmations off → immediate session → dashboard).
  const email = `e2e+${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Create a blank character → lands in the editor.
  await page.getByRole("button", { name: "+ New character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "New Character" })).toBeVisible();

  // Enter edit mode and change the name, an attribute, and add a skill.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Pilot");
  await page.getByLabel("STR", { exact: true }).fill("150");

  const skills = page.locator("section", { hasText: "// SKILLS" });
  await skills.getByRole("button", { name: "+ Add skill" }).click();
  await skills.getByPlaceholder("Name").fill("Gunnery/'Mech");
  await skills.getByLabel("XP").fill("80");

  await page.getByRole("button", { name: "Save" }).click();

  // Back to the read view with the saved data.
  await expect(page.getByRole("heading", { name: "Test Pilot" })).toBeVisible();
  await expect(page.getByText("Gunnery/'Mech")).toBeVisible();

  // Reload: the row persisted server-side.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Test Pilot" })).toBeVisible();
  await expect(page.getByText("Gunnery/'Mech")).toBeVisible();
});
