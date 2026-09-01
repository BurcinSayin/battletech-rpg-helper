import { test, expect, type Browser, type Page } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) with all
// migrations applied — including the realtime publication — and email
// confirmations disabled, so signup yields a session immediately.
//
// This is the suite's only two-context spec. It has to be: the whole point is that
// a GM's save reaches a *different user's* already-open page with no interaction.
// The email prefixes are distinct because the shared `Date.now()` suffix the other
// specs use has millisecond resolution and would collide across two signups here.

test.setTimeout(90_000);

async function signUp(browser: Browser, prefix: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e+${prefix}-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { page, close: () => context.close() };
}

test("GM edits a member's character → the player's open page syncs", async ({ browser }) => {
  const gm = await signUp(browser, "gm");
  const player = await signUp(browser, "player");

  try {
    // GM creates a campaign and reads its invite code.
    await gm.page.goto("/campaigns");
    await gm.page.getByLabel("Create a campaign").fill("Wolf's Dragoons");
    await gm.page.getByRole("button", { name: "Create" }).click();
    await expect(gm.page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const inviteCode = await gm.page.getByLabel("Invite code").inputValue();
    expect(inviteCode).toMatch(/^[0-9A-F]{8}$/);

    // Player joins with that code.
    await player.page.goto("/campaigns");
    await player.page.getByLabel("Join a campaign").fill(inviteCode);
    await player.page.getByRole("button", { name: "Join" }).click();
    await expect(player.page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    await expect(player.page.getByRole("heading", { name: "Wolf's Dragoons" })).toBeVisible();

    // AC 5: the campaign shows up on the player's dashboard panel, read-only.
    await player.page.goto("/dashboard");
    const panel = player.page.locator("div").filter({ hasText: /^Campaigns/ }).last();
    await expect(
      player.page.getByRole("link", { name: /Wolf's Dragoons/ }).first(),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "+ New character" })).toHaveCount(0);

    // Player creates a character and attaches it to the campaign.
    await player.page.getByRole("button", { name: "+ New character" }).click();
    await expect(player.page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
    await player.page.getByRole("button", { name: "Edit" }).click();
    await player.page.getByLabel("Name", { exact: true }).fill("Grey Death Scout");
    await player.page.getByLabel("Campaign").selectOption({ label: "Wolf's Dragoons" });
    await player.page.getByRole("button", { name: "Save" }).click();

    // A successful save exits edit mode, so the player is now sitting in view mode
    // on the character page. From here it is not touched again.
    await expect(
      player.page.getByRole("heading", { name: "Grey Death Scout" }),
    ).toBeVisible();

    // GM opens the member's character from the campaign roster and renames it.
    const newName = `Renamed By GM ${Date.now()}`;
    await gm.page.reload();
    await gm.page.getByRole("link", { name: /Grey Death Scout/ }).click();
    await expect(gm.page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
    await gm.page.getByRole("button", { name: "Edit" }).click();
    await gm.page.getByLabel("Name", { exact: true }).fill(newName);
    await gm.page.getByRole("button", { name: "Save" }).click();
    await expect(gm.page.getByRole("heading", { name: newName })).toBeVisible();

    // The payoff: the player's page updates with NO interaction — no reload, no
    // click, nothing but this assertion's own polling.
    await expect(player.page.getByRole("heading", { name: newName })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await gm.close();
    await player.close();
  }
});

test("a non-member gets a 404 for a campaign, not a 403 (AC 13)", async ({ browser }) => {
  const gm = await signUp(browser, "owner");
  const stranger = await signUp(browser, "stranger");

  try {
    await gm.page.goto("/campaigns");
    await gm.page.getByLabel("Create a campaign").fill("Kell Hounds");
    await gm.page.getByRole("button", { name: "Create" }).click();
    await expect(gm.page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const campaignUrl = gm.page.url();

    // campaigns_select_member returns nothing for a non-member, which the page
    // turns into notFound() — a 404, so the UI never reveals that the campaign
    // exists but is not yours (app/(app)/AGENTS.md:75-76).
    const response = await stranger.page.goto(campaignUrl);
    expect(response?.status()).toBe(404);
    await expect(stranger.page.getByText("Kell Hounds")).toHaveCount(0);
  } finally {
    await gm.close();
    await stranger.close();
  }
});
