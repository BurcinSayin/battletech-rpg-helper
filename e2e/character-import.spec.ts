import path from "node:path";
import { test, expect } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) with the init
// migration applied and email confirmations disabled, so signup yields a session.

const LISA_FIXTURE = path.resolve("lib/btcc/__fixtures__/lisa.btcc");

test("import .btcc → preview → persist", async ({ page }) => {
  // Sign up (confirmations off → immediate session → dashboard).
  const email = `e2e+${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Open the import screen.
  await page.getByRole("link", { name: "Import .btcc" }).click();
  await expect(page).toHaveURL(/\/characters\/import$/);

  // Upload the fixture — a preview of the parsed pilot appears.
  await page.getByLabel("Upload .btcc file").setInputFiles(LISA_FIXTURE);
  await expect(page.getByRole("heading", { name: "Lisa" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import character" }),
  ).toBeVisible();

  // Confirm → lands in the editor for the new character.
  await page.getByRole("button", { name: "Import character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Lisa" })).toBeVisible();

  // Reload: the imported character persisted server-side.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lisa" })).toBeVisible();
});
