import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

// Requires the local Supabase stack with all migrations applied (including
// 20261016120000_character_mech) and email confirmations disabled. The predefined
// catalog is fetched server-side from the MTF host, so the dev server needs
// network access to it.

const SHOT_DIR = path.join(os.tmpdir(), "opencode", "mech-shots");
const PASSWORD = "secret123";

function uniqueEmail(tag: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e+mech-${tag}-${Date.now()}-${rand}@example.com`;
}

async function signUp(page: Page, tag: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(uniqueEmail(tag));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Dev-server route compilation can exceed the default 5s under parallel load.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

/** Creates a blank character from the dashboard; returns its URL path. */
async function createBlankCharacter(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create blank character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "New Character" }),
  ).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}

// Edit/tab controls are client-only: a click before hydration is a no-op, so retry
// the click until its effect is visible (idempotent: Edit disappears once it works).
async function enterEdit(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit character" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Back in view mode: the Edit button returns once the save has settled.
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
}

/** The Mech tab panel (its accessible name is the tab label). */
function mechPanel(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Mech" });
}

async function openMechTab(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: "Mech" });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
}

/** Expands a collapsed critical-slot section in the edit view. */
async function expandSlotSection(page: Page, location: string): Promise<void> {
  const summary = mechPanel(page)
    .locator("summary")
    .filter({ hasText: new RegExp(`^${location}`) });
  await summary.click();
}

function confirmDialog(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title });
}

async function screenshot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

/** Viewer-side copy of the signed-in session, so a second context is the same user. */
async function sharedSessionPage(
  browser: { newContext: () => Promise<BrowserContext> },
  from: Page,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addCookies(await from.context().cookies());
  return { context, page: await context.newPage() };
}

test("manual mech: create, save, reload, and view (desktop + mobile)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "manual");
  await createBlankCharacter(page);

  await enterEdit(page);
  await openMechTab(page);
  const mech = mechPanel(page);
  await mech.getByRole("button", { name: "Add mech manually" }).click();

  await mech.getByLabel("Chassis", { exact: true }).fill("Pilot Chassis");
  await mech.getByLabel("Model", { exact: true }).fill("PC-1");
  await mech.getByLabel("Mass", { exact: true }).fill("40");
  await mech.getByLabel("Armor CT", { exact: true }).fill("20");

  await mech.getByRole("button", { name: "Add weapon" }).click();
  await mech.getByLabel("Weapon 1 name", { exact: true }).fill("Medium Laser");
  await mech.getByLabel("Weapon 1 location", { exact: true }).fill("Right Arm");

  await expandSlotSection(page, "Left Arm");
  await mech.getByLabel("LA slot 1", { exact: true }).fill("Shoulder");
  await mech.getByLabel("LA slot 4", { exact: true }).fill("Medium Laser");

  await save(page);
  // The tab selection survives the save; the saved view shows the draft.
  await expect(
    mechPanel(page).getByRole("heading", { name: "Pilot Chassis PC-1" }),
  ).toBeVisible();

  // Reload: the mech was persisted server-side and the tab resets to Sheet.
  await page.reload();
  await openMechTab(page);
  const view = mechPanel(page);
  await expect(
    view.getByRole("heading", { name: "Pilot Chassis PC-1" }),
  ).toBeVisible();
  await expect(view.getByRole("table")).toContainText("Medium Laser");
  await expect(
    view.getByRole("region", { name: "Left Arm critical slots" }),
  ).toContainText("Shoulder");
  await expect(view.locator("li").filter({ hasText: /CT\s*20/ })).toHaveCount(
    1,
  );
  await screenshot(page, "mech-view-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    view.getByRole("heading", { name: "Pilot Chassis PC-1" }),
  ).toBeVisible();
  await screenshot(page, "mech-view-mobile");

  // Edit mode re-seeds from the saved mech.
  await enterEdit(page);
  await openMechTab(page);
  const edit = mechPanel(page);
  await expect(edit.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Pilot Chassis",
  );
  await expect(edit.getByLabel("Mass", { exact: true })).toHaveValue("40");
  await expect(edit.getByLabel("Armor CT", { exact: true })).toHaveValue("20");
  await expect(edit.getByLabel("Weapon 1 name", { exact: true })).toHaveValue(
    "Medium Laser",
  );
  await screenshot(page, "mech-edit-mobile");

  await page.setViewportSize({ width: 1280, height: 800 });
  await screenshot(page, "mech-edit-desktop");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("character without a mech saves normally and shows no mech", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "nomech");
  await createBlankCharacter(page);

  await enterEdit(page);
  await page.getByLabel("Name", { exact: true }).fill("No Mech Pilot");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "No Mech Pilot" }),
  ).toBeVisible();

  await page.reload();
  await openMechTab(page);
  await expect(
    mechPanel(page).getByText("No mech", { exact: true }),
  ).toBeVisible();

  await enterEdit(page);
  await openMechTab(page);
  await expect(
    mechPanel(page).getByRole("button", { name: "Add mech manually" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("catalog pick (Firestarter FS9-H) loads, edits, and persists repeats, empty slots and order", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "catalog");
  await createBlankCharacter(page);

  await enterEdit(page);
  await openMechTab(page);
  const mech = mechPanel(page);
  await mech
    .getByRole("combobox", { name: "Search predefined mechs" })
    .fill("Firestarter");
  await mech.getByRole("option", { name: /^Firestarter FS9-H\b/ }).click();

  // Loaded server-side and populated into the draft.
  await expect(mech.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Firestarter",
    { timeout: 30_000 },
  );
  await expect(mech.getByLabel("Model", { exact: true })).toHaveValue("FS9-H");
  await expect(mech.getByLabel("Mass", { exact: true })).toHaveValue("35");
  await expect(mech.getByLabel("Walk MP", { exact: true })).toHaveValue("6");
  await expect(mech.getByLabel("Jump MP", { exact: true })).toHaveValue("6");
  await expect(
    mech.getByText("Loaded from Firestarter FS9-H.mtf"),
  ).toBeVisible();
  await expect(mech.getByLabel("Armor CT", { exact: true })).toHaveValue("13");

  // Edit one value after loading.
  await mech.getByLabel("Armor CT", { exact: true }).fill("12");
  await save(page);

  await page.reload();
  await openMechTab(page);
  const view = mechPanel(page);
  await expect(
    view.getByRole("heading", { name: "Firestarter FS9-H" }),
  ).toBeVisible();

  // Repeated weapons: two identical "Flamer, Center Torso" rows, in source order.
  const rows = view.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(9); // header + 8 weapons
  await expect(rows.nth(1)).toContainText("Flamer");
  await expect(rows.nth(1)).toContainText("Center Torso");
  await expect(rows.nth(2)).toContainText("Flamer");
  await expect(rows.nth(2)).toContainText("Center Torso");
  await expect(rows.nth(3)).toContainText("Medium Laser");

  // Slot order and empty slots: Left Arm has 5 entries then -Empty- padding.
  const leftArm = view.getByRole("region", { name: "Left Arm critical slots" });
  const leftExpand = leftArm.getByRole("button", { expanded: false });
  if (await leftExpand.isVisible()) await leftExpand.click();
  const leftItems = leftArm.getByRole("listitem");
  await expect(leftItems).toHaveCount(12);
  await expect(leftItems.nth(0)).toContainText("Shoulder");
  await expect(leftItems.nth(3)).toContainText("Medium Laser");
  await expect(leftItems.nth(4)).toContainText("Flamer");
  await expect(leftItems.nth(5)).toContainText("-Empty-");

  const centerTorso = view.getByRole("region", {
    name: "Center Torso critical slots",
  });
  const centerExpand = centerTorso.getByRole("button", { expanded: false });
  if (await centerExpand.isVisible()) await centerExpand.click();
  await expect(centerTorso.getByRole("listitem")).toHaveCount(12);
  await expect(centerTorso.getByRole("listitem").nth(0)).toContainText(
    "Fusion Engine",
  );
  await expect(centerTorso.getByRole("listitem").nth(11)).toContainText(
    "Flamer (R)",
  );

  // The edited armor value persisted.
  await enterEdit(page);
  await openMechTab(page);
  await expect(
    mechPanel(page).getByLabel("Armor CT", { exact: true }),
  ).toHaveValue("12");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("replacing an existing draft asks first; cancel keeps it, replace loads the new mech", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "replace");
  await createBlankCharacter(page);

  await enterEdit(page);
  await openMechTab(page);
  const mech = mechPanel(page);
  await mech.getByRole("button", { name: "Add mech manually" }).click();
  await mech.getByLabel("Chassis", { exact: true }).fill("Draft Chassis");

  const search = mech.getByRole("combobox", {
    name: "Search predefined mechs",
  });
  await search.fill("Firestarter");
  await mech.getByRole("option", { name: /^Firestarter FS9-H\b/ }).click();

  const dialog = confirmDialog(page, "Replace current mech draft?");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(mech.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Draft Chassis",
  );

  await search.fill("Firestarter");
  await mech.getByRole("option", { name: /^Firestarter FS9-H\b/ }).click();
  await expect(
    confirmDialog(page, "Replace current mech draft?"),
  ).toBeVisible();
  await confirmDialog(page, "Replace current mech draft?")
    .getByRole("button", { name: "Replace", exact: true })
    .click();
  await expect(mech.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Firestarter",
    { timeout: 30_000 },
  );
  await expect(mech.getByLabel("Model", { exact: true })).toHaveValue("FS9-H");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a failed catalog load shows an error and leaves the draft untouched", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "loadfail");
  const charPath = await createBlankCharacter(page);

  await enterEdit(page);
  await openMechTab(page);
  const mech = mechPanel(page);
  await mech.getByRole("button", { name: "Add mech manually" }).click();
  await mech.getByLabel("Chassis", { exact: true }).fill("Keep Me");

  // Fail only the catalog-load server action (its argument is a .mtf file name).
  // The search action and the save action still reach the server.
  await page.route(
    (url) => url.pathname === charPath,
    async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      if (request.method() === "POST" && body.includes("FS9-H.mtf")) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    },
  );

  const search = mech.getByRole("combobox", {
    name: "Search predefined mechs",
  });
  await search.fill("Firestarter");
  await mech.getByRole("option", { name: /^Firestarter FS9-H\b/ }).click();
  await confirmDialog(page, "Replace current mech draft?")
    .getByRole("button", { name: "Replace", exact: true })
    .click();

  await expect(
    mech.getByRole("alert").filter({ hasText: "could not be loaded" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(mech.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Keep Me",
  );
  await expect(mech.getByLabel("Chassis", { exact: true })).toBeEnabled();
  await page.unrouteAll({ behavior: "wait" });

  // Still a usable draft: save it and it persists.
  await save(page);
  await page.reload();
  await openMechTab(page);
  await expect(
    mechPanel(page).getByRole("heading", { name: "Keep Me" }),
  ).toBeVisible();
});

test("a stale save conflicts; keep editing preserves the mech draft", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "conflict");
  const charPath = await createBlankCharacter(page);
  const charUrl = new URL(charPath, page.url()).toString();

  const { context: contextB, page: stale } = await sharedSessionPage(
    browser,
    page,
  );
  try {
    // B opens the character and starts a mech edit before A saves.
    await stale.goto(charUrl);
    await enterEdit(stale);
    await openMechTab(stale);
    await mechPanel(stale)
      .getByRole("button", { name: "Add mech manually" })
      .click();
    await mechPanel(stale)
      .getByLabel("Chassis", { exact: true })
      .fill("Bravo Chassis");

    // A (fresh) saves a mech change, bumping the version under B.
    await enterEdit(page);
    await openMechTab(page);
    await mechPanel(page)
      .getByRole("button", { name: "Add mech manually" })
      .click();
    await mechPanel(page)
      .getByLabel("Chassis", { exact: true })
      .fill("Alpha Chassis");
    await save(page);

    // B's save is based on the old version: conflict, nothing overwritten.
    await stale.getByRole("button", { name: "Save", exact: true }).click();
    const dialog = stale.getByRole("dialog", { name: "Remote changes" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      mechPanel(stale).getByLabel("Chassis", { exact: true }),
    ).toHaveValue("Bravo Chassis");

    // A's save is what the server holds.
    await page.reload();
    await openMechTab(page);
    await expect(
      mechPanel(page).getByRole("heading", { name: "Alpha Chassis" }),
    ).toBeVisible();
  } finally {
    await contextB.close();
  }
});

test("removing a mech asks first and persists the removal", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "remove");
  await createBlankCharacter(page);

  await enterEdit(page);
  await openMechTab(page);
  await mechPanel(page)
    .getByRole("button", { name: "Add mech manually" })
    .click();
  await mechPanel(page).getByLabel("Chassis", { exact: true }).fill("Doomed");
  await save(page);

  await enterEdit(page);
  await openMechTab(page);
  await mechPanel(page).getByRole("button", { name: "Remove mech" }).click();
  const dialog = confirmDialog(page, "Remove this mech?");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    mechPanel(page).getByLabel("Chassis", { exact: true }),
  ).toHaveValue("Doomed");

  await mechPanel(page).getByRole("button", { name: "Remove mech" }).click();
  await confirmDialog(page, "Remove this mech?")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(
    mechPanel(page).getByText("This character has no mech.", { exact: true }),
  ).toBeVisible();
  await save(page);

  await page.reload();
  await openMechTab(page);
  await expect(
    mechPanel(page).getByText("No mech", { exact: true }),
  ).toBeVisible();
});

test("an unrelated user cannot open another user's character", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "owner");
  const charPath = await createBlankCharacter(page);
  const charUrl = new URL(charPath, page.url()).toString();

  const other = await browser.newContext();
  try {
    const intruder = await other.newPage();
    await signUp(intruder, "intruder");
    const response = await intruder.goto(charUrl);
    expect(response?.status()).toBe(404);
    await expect(
      intruder.getByRole("heading", { name: "New Character" }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});
