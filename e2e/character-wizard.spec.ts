import { test, expect } from "@playwright/test";

test("five-stage wizard → create → editor XP → edit → reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e+wizard-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/characters/new");
  await page
    .getByRole("textbox", { name: "Character name" })
    .fill("Wizard Pilot");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByLabel("Affiliation", { exact: true })
    .selectOption({ label: "Major Periphery State" });
  await page
    .getByLabel("Sub-affiliation", { exact: true })
    .selectOption({ label: "None" });
  await page.getByLabel("Starting language").selectOption({ label: "English" });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Stage 1 module").selectOption({ label: "Street" });
  for (let position = 1; position <= 4; position++) {
    await page
      .getByLabel(`Module choice ${position}`, { exact: true })
      .selectOption({ label: "STR (attribute)" });
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Stage 2 module").selectOption({ label: "Back Woods" });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByLabel("School", { exact: true })
    .selectOption({ label: "Technical College" });
  await page
    .getByLabel("Interests/Any — choice 1")
    .selectOption({ label: "Interests/Aerospace (skill)" });
  await page
    .getByLabel("Basic field", { exact: true })
    .selectOption({ label: "Pilot - Aerospace (Civilian)" });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByLabel("Real Life module", { exact: true })
    .selectOption({ label: "Travel" });
  await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
  await page.getByRole("button", { name: "Add Real Life module" }).click();
  const balance = await page
    .getByRole("region", { name: "XP balances" })
    .textContent();
  const remaining = Number(
    balance?.match(/Wizard XP remaining: (\d+) XP/)?.[1],
  );
  expect(remaining).toBeGreaterThanOrEqual(0);
  await page.screenshot({
    path: "test-results/wizard-before-finish.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Wizard Pilot" }),
  ).toBeVisible();
  await expect(
    page.getByText(`${remaining.toLocaleString()} left`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(`${remaining.toLocaleString()} left`, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/wizard-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const strength = page.getByLabel("STR", { exact: true });
  await strength.fill(String(Number(await strength.inputValue()) + 50));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(`${(remaining - 50).toLocaleString()} left`, {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
