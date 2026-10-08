import { test, expect, type Request } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) with all
// migrations applied (including realtime) and email confirmations disabled.

test("create → edit → save → persist", async ({ page }) => {
  // Sign up (confirmations off → immediate session → dashboard).
  const email = `e2e+${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Create a blank character → lands in the editor.
  await page.getByRole("button", { name: "Create blank character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "New Character" }),
  ).toBeVisible();

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

  // Client-side navigation to another character must not retain this snapshot.
  await page.getByRole("link", { name: "BattleTech RPG Helper" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Create blank character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "New Character" }),
  ).toBeVisible();
  await expect(page.getByText("Gunnery/'Mech")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "New Character",
  );
  await page.getByLabel("Name", { exact: true }).fill("Second Pilot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Second Pilot" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "BattleTech RPG Helper" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: /Test Pilot/ }).click();
  await expect(page.getByRole("heading", { name: "Test Pilot" })).toBeVisible();
  await expect(page.getByText("Gunnery/'Mech")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Test Pilot",
  );
});

test("in-flight refresh preserves an active edit and its save conflict", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);

  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e+snapshot-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Create blank character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "New Character" }),
  ).toBeVisible();

  const characterUrl = page.url();
  const characterPath = new URL(characterUrl).pathname;
  const remotePage = await context.newPage();
  let releaseResponses!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponses = resolve;
  });
  let bufferedRemoteRequest: Request | null = null;
  const isRefresh = (request: Request) => {
    const headers = request.headers();
    return (
      request.method() === "GET" &&
      new URL(request.url()).pathname === characterPath &&
      headers.rsc === "1" &&
      !headers["next-router-prefetch"] &&
      !headers.purpose?.includes("prefetch") &&
      !headers["sec-purpose"]?.includes("prefetch")
    );
  };

  try {
    await remotePage.goto(characterUrl);
    await remotePage.getByRole("button", { name: "Edit" }).click();
    await remotePage.getByLabel("Name", { exact: true }).fill("Warmup Pilot");
    await remotePage.getByRole("button", { name: "Save" }).click();
    await expect(
      remotePage.getByRole("heading", { name: "Warmup Pilot" }),
    ).toBeVisible();

    // No interaction on the first page: prove the real subscription is working.
    await expect(
      page.getByRole("heading", { name: "Warmup Pilot" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();

    // Hold every matching refresh, not merely the first response in a burst.
    // Buffer real server data before opening Edit to reproduce the in-flight race.
    await page.route(
      (url) => url.pathname === characterPath,
      async (route) => {
        if (!isRefresh(route.request())) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const body = await response.body();
        if (body.toString().includes("Remote Pilot"))
          bufferedRemoteRequest = route.request();
        await responseGate;
        await route.fulfill({ response, body });
      },
    );

    await remotePage.getByRole("button", { name: "Edit" }).click();
    await remotePage.getByLabel("Name", { exact: true }).fill("Remote Pilot");
    await remotePage.getByRole("button", { name: "Save" }).click();
    await expect(
      remotePage.getByRole("heading", { name: "Remote Pilot" }),
    ).toBeVisible();
    await expect
      .poll(() => bufferedRemoteRequest !== null, { timeout: 20_000 })
      .toBe(true);

    await page.getByRole("button", { name: "Edit" }).click();
    const nameInput = page.getByLabel("Name", { exact: true });
    await nameInput.fill("Unsaved Pilot");
    const bufferedRequest = bufferedRemoteRequest;
    const refreshResponse = page.waitForResponse(
      (response) => response.request() === bufferedRequest,
    );
    releaseResponses();
    const deliveredResponse = await refreshResponse;
    expect(await deliveredResponse.finished()).toBeNull();

    const notice = page
      .getByRole("status")
      .filter({ hasText: "This character was updated elsewhere." });
    await expect(nameInput).toHaveValue("Unsaved Pilot");
    await expect(notice).toBeVisible();

    // This goes through the real action and RPC with the pre-refresh base version.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const conflict = page.getByRole("dialog", { name: "Remote changes" });
    await expect(conflict).toBeVisible();
    await expect(nameInput).toHaveValue("Unsaved Pilot");
    await conflict.getByRole("button", { name: "Keep editing" }).click();
    await expect(conflict).toHaveCount(0);
    await expect(nameInput).toHaveValue("Unsaved Pilot");
    await notice.getByRole("button", { name: "Reload" }).click();
    await expect(
      page.getByRole("heading", { name: "Remote Pilot" }),
    ).toBeVisible();
    await expect(nameInput).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();
  } finally {
    releaseResponses();
    try {
      await page.unrouteAll({ behavior: "wait" });
    } finally {
      await remotePage.close();
    }
  }
});
