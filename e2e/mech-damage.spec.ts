import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

// Same disposable signup/blank/manual setup as mech.spec.ts. Requires local
// Supabase through 20261016130000_character_mech_damage, confirmations disabled,
// and realtime enabled. The catalog replacement uses live server actions/MTF.
const PASSWORD = "secret123";
const RESET_WARNING =
  "Saving this mech change resets its armor and structure damage, structure maxima, critical hits and heat. Pilot hits are kept.";
const STALE = "This character changed since you started marking damage.";

function mechPanel(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Mech" });
}

function button(page: Page, name: string): Locator {
  return mechPanel(page).getByRole("button", { name, exact: true });
}

async function signUp(page: Page, tag: string): Promise<void> {
  const rand = Math.random().toString(36).slice(2, 8);
  await page.goto("/signup");
  await page
    .getByLabel("Email")
    .fill(`e2e+mech-damage-${tag}-${Date.now()}-${rand}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

async function createBlankCharacter(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create blank character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "New Character" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  return new URL(page.url()).pathname;
}

// Idempotent hydration retries, as in mech.spec.ts; never retry a damage tap.
async function enterEdit(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit character" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
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

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeEnabled({
    timeout: 30_000,
  });
}

async function reloadMech(page: Page): Promise<void> {
  await page.reload();
  await openMechTab(page);
}

async function expandEditSlots(page: Page, location: string): Promise<void> {
  await mechPanel(page)
    .locator("summary")
    .filter({ hasText: new RegExp(`^${location}`) })
    .click();
}

async function expandViewSlots(page: Page, location: string): Promise<Locator> {
  const region = mechPanel(page).getByRole("region", {
    name: `${location} critical slots`,
    exact: true,
  });
  const expand = region.getByRole("button", { expanded: false });
  if (await expand.isVisible()) await expand.click();
  return region;
}

async function addManualMech(page: Page): Promise<void> {
  await enterEdit(page);
  await openMechTab(page);
  const panel = mechPanel(page);
  await panel.getByRole("button", { name: "Add mech manually" }).click();
  await panel.getByLabel("Chassis", { exact: true }).fill("Damage Chassis");
  await panel.getByLabel("Model", { exact: true }).fill("DC-1");
  await panel.getByLabel("Mass", { exact: true }).fill("40");
  await panel.getByLabel("Armor CT", { exact: true }).fill("3");
  await panel.getByLabel("Armor RTC", { exact: true }).fill("2");
  // LA remains zero armor; slots intentionally include repeats and both empties.
  await expandEditSlots(page, "Left Arm");
  await panel.getByLabel("LA slot 1", { exact: true }).fill("Medium Laser");
  await panel.getByLabel("LA slot 2", { exact: true }).fill("Medium Laser");
  await panel.getByLabel("LA slot 3", { exact: true }).fill("-Empty-");
  await panel.getByLabel("LA slot 4", { exact: true }).fill("");
  await panel.getByRole("button", { name: "Add weapon" }).click();
  await panel.getByLabel("Weapon 1 name", { exact: true }).fill("Medium Laser");
  await panel.getByLabel("Weapon 1 location", { exact: true }).fill("Left Arm");
  await save(page);
  await expect(
    mechPanel(page).getByRole("heading", { name: "Damage Chassis DC-1" }),
  ).toBeVisible();
}

async function setupManual(page: Page, tag: string): Promise<string> {
  await signUp(page, tag);
  const characterPath = await createBlankCharacter(page);
  await addManualMech(page);
  return characterPath;
}

function pointsCard(page: Page, name: string): Locator {
  return mechPanel(page)
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name, exact: true }),
    });
}

function counterValue(page: Page, label: "Heat" | "Pilot hits"): Locator {
  return mechPanel(page)
    .getByText(label, { exact: true })
    .locator("..")
    .locator(":scope > span")
    .nth(1);
}

async function tap(page: Page, name: string, count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) await button(page, name).click();
}

// Observe the actual action/revalidation/echo path without delaying or mocking
// the server. MutationObserver catches transient Applying/false-stale states
// that a final-state assertion alone would miss (Gate 2 M2).
async function apply(page: Page): Promise<void> {
  const panel = mechPanel(page);
  await panel.evaluate((root) => {
    const seen: string[] = [];
    const capture = () => {
      for (const status of root.querySelectorAll('[role="status"]')) {
        const text = status.textContent ?? "";
        if (!seen.includes(text)) seen.push(text);
      }
      root.setAttribute("data-e2e-apply-statuses", JSON.stringify(seen));
    };
    const observer = new MutationObserver(capture);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    capture();
    root.addEventListener(
      "e2e-stop-apply-observer",
      () => observer.disconnect(),
      {
        once: true,
      },
    );
  });
  try {
    await button(page, "Apply damage").click();
    await expect(panel.getByRole("status")).toHaveText(
      "Damage is up to date.",
      {
        timeout: 30_000,
      },
    );
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeEnabled({
      timeout: 30_000,
    });
    const statuses: string[] = JSON.parse(
      (await panel.getAttribute("data-e2e-apply-statuses")) ?? "[]",
    );
    expect(statuses.some((status) => status.includes("Applying damage"))).toBe(
      true,
    );
    expect(statuses.some((status) => status.includes(STALE))).toBe(false);
  } finally {
    await panel.evaluate((root) => {
      root.dispatchEvent(new Event("e2e-stop-apply-observer"));
      root.removeAttribute("data-e2e-apply-statuses");
    });
  }
}

async function seedDamage(page: Page): Promise<void> {
  await tap(page, "Damage armor CT");
  await button(page, "Track structure").click();
  await mechPanel(page)
    .getByRole("spinbutton", { name: "Structure max Left Arm", exact: true })
    .fill("7");
  await tap(page, "Damage structure Left Arm");
  await expandViewSlots(page, "Left Arm");
  await tap(page, "Critical hit Left Arm slot 1");
  await tap(page, "Increase heat", 2);
  await tap(page, "Add pilot hit");
  await apply(page);
}

async function expectMechReset(
  page: Page,
  armorMaximum: number,
): Promise<void> {
  await expect(pointsCard(page, "Damage armor CT")).toContainText(
    `${armorMaximum}/${armorMaximum}`,
  );
  await expect(
    mechPanel(page).getByRole("heading", { name: "// STRUCTURE", exact: true }),
  ).toHaveCount(0);
  await expect(button(page, "Track structure")).toBeVisible();
  await expect(counterValue(page, "Heat")).toHaveText("0");
  await expect(counterValue(page, "Pilot hits")).toHaveText("1");
  await expandViewSlots(page, "Left Arm");
  await expect(button(page, "Critical hit Left Arm slot 1")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
}

/** Separate storage/connection, same signed-in owner, same project's device. */
async function sharedSessionPage(
  browser: Browser,
  from: Page,
): Promise<{ context: BrowserContext; page: Page }> {
  const { isMobile, hasTouch, deviceScaleFactor, userAgent } =
    test.info().project.use;
  const context = await browser.newContext({
    viewport: from.viewportSize(),
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
  });
  await context.addCookies(await from.context().cookies());
  return { context, page: await context.newPage() };
}

// Wait for the real postgres_changes join acknowledgement before the other
// context writes. Hydration alone does not mean realtime has subscribed.
function observeRealtimeJoin(
  page: Page,
  characterPath: string,
): () => Promise<void> {
  let joined = false;
  const id = characterPath.split("/").at(-1)!;
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload)) as
          | {
              topic: string;
              event: string;
              payload: {
                status?: string;
                response?: { postgres_changes?: unknown[] };
              };
            }
          | [
              unknown,
              unknown,
              string,
              string,
              { status?: string; response?: { postgres_changes?: unknown[] } },
            ];
        const [topic, event, message] = Array.isArray(frame)
          ? [frame[2], frame[3], frame[4]]
          : [frame.topic, frame.event, frame.payload];
        if (
          topic?.includes(`character:${id}:`) &&
          event === "phx_reply" &&
          message?.status === "ok" &&
          (message.response?.postgres_changes?.length ?? 0) > 0
        )
          joined = true;
      } catch {
        // Non-JSON frames are irrelevant; never log auth-bearing frames.
      }
    });
  });
  return async () => {
    await expect
      .poll(() => joined, {
        timeout: 30_000,
        message: "authenticated character realtime subscription",
      })
      .toBe(true);
  };
}

test("view-mode armor bounds and sequential structure-max typing preserve loss across Apply/reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setupManual(page, "bounds");
  await expect(
    page.getByRole("heading", { name: "Edit character" }),
  ).toHaveCount(0);
  await expect(
    mechPanel(page).getByRole("heading", { name: "// STRUCTURE", exact: true }),
  ).toHaveCount(0);
  await button(page, "Track structure").click();
  await expect(button(page, "Repair armor CT")).toBeDisabled();
  await expect(button(page, "Damage armor LA")).toBeDisabled();
  await expect(button(page, "Repair armor LA")).toBeDisabled();
  await tap(page, "Damage armor CT", 3);
  await tap(page, "Damage armor RTC", 2);
  await expect(pointsCard(page, "Damage armor CT")).toContainText("0/3");
  await expect(pointsCard(page, "Damage armor RTC")).toContainText("0/2");
  await expect(pointsCard(page, "Damage armor RTC")).toContainText("Rear");
  await expect(button(page, "Damage armor CT")).toBeDisabled();
  await expect(button(page, "Damage armor RTC")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeDisabled();
  await expect(button(page, "Damage structure Left Arm")).toBeDisabled();
  const max = mechPanel(page).getByRole("spinbutton", {
    name: "Structure max Left Arm",
    exact: true,
  });
  await max.fill("12");
  await tap(page, "Damage structure Left Arm", 5);
  const structure = pointsCard(page, "Damage structure Left Arm");
  await expect(structure).toContainText("7/12");

  // Genuine per-keystroke events, not fill(finalValue) (M1). Intermediate 1
  // clamps live, but the final 15 must retain the original five points lost.
  await max.focus();
  await max.press("ControlOrMeta+A");
  await max.pressSequentially("1");
  await expect(structure).toContainText("0/1");
  await max.pressSequentially("5");
  await expect(structure).toContainText("10/15");
  await max.press("Tab");
  await max.focus();
  await max.press("ControlOrMeta+A");
  await max.press("Backspace");
  await expect(structure).toContainText("Not tracked");
  await max.pressSequentially("18");
  await expect(structure).toContainText("13/18");
  await max.press("Tab");

  const otherMax = mechPanel(page).getByRole("spinbutton", {
    name: "Structure max Right Arm",
    exact: true,
  });
  await otherMax.fill("1000");
  await otherMax.press("Tab");
  await expect(otherMax).toHaveValue("999");
  await apply(page);
  await reloadMech(page);
  await expect(structure).toContainText("13/18");
  await expect(pointsCard(page, "Damage structure Right Arm")).toContainText(
    "999/999",
  );
  await expect(max).toHaveCount(0);
  await button(page, "Configure structure").click();
  await expect(max).toHaveValue("18");
  await expect(otherMax).toHaveValue("999");
  await expect(pointsCard(page, "Damage armor CT")).toContainText("0/3");
  await expect(pointsCard(page, "Damage armor RTC")).toContainText("0/2");

  await max.fill("3");
  await max.press("Tab");
  await expect(structure).toContainText("0/3");
  await expect(button(page, "Damage structure Left Arm")).toBeDisabled();
  await tap(page, "Repair structure Left Arm", 3);
  await expect(structure).toContainText("3/3");
  await expect(button(page, "Repair structure Left Arm")).toBeDisabled();
  await tap(page, "Repair armor CT", 3);
  await tap(page, "Repair armor RTC", 2);
  await expect(button(page, "Repair armor CT")).toBeDisabled();
  await expect(button(page, "Repair armor RTC")).toBeDisabled();
  await otherMax.fill("");
  await otherMax.press("Tab");
  await expect(button(page, "Damage structure Right Arm")).toBeDisabled();
  await apply(page);
  await reloadMech(page);
  await expect(structure).toContainText("3/3");
  await expect(pointsCard(page, "Damage structure Right Arm")).toHaveCount(0);
  await button(page, "Configure structure").click();
  await expect(otherMax).toHaveValue("");
  await expect(pointsCard(page, "Damage armor CT")).toContainText("3/3");
  await expect(pointsCard(page, "Damage armor RTC")).toContainText("2/2");
});

test("critical repeats/empties stay indexed and base unchanged; counters and Reset all retain maxima", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setupManual(page, "slots-reset");
  const slots = await expandViewSlots(page, "Left Arm");
  const names = await slots.getByRole("listitem").allTextContents();
  await expect(button(page, "Critical hit Left Arm slot 1")).toContainText(
    "Medium Laser",
  );
  await expect(button(page, "Critical hit Left Arm slot 2")).toContainText(
    "Medium Laser",
  );
  await expect(button(page, "Critical hit Left Arm slot 3")).toContainText(
    "-Empty-",
  );
  await expect(button(page, "Decrease heat")).toBeDisabled();
  await expect(button(page, "Remove pilot hit")).toBeDisabled();
  await seedDamage(page);
  await tap(page, "Critical hit Left Arm slot 3");
  await tap(page, "Critical hit Left Arm slot 4");
  await apply(page);
  await reloadMech(page);
  await expandViewSlots(page, "Left Arm");
  for (const slot of [1, 3, 4])
    await expect(
      button(page, `Critical hit Left Arm slot ${slot}`),
    ).toHaveAttribute("aria-pressed", "true");
  await expect(button(page, "Critical hit Left Arm slot 2")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await slots.getByRole("listitem").allTextContents()).toEqual(names);
  await expect(counterValue(page, "Heat")).toHaveText("2");
  await expect(counterValue(page, "Pilot hits")).toHaveText("1");

  // Damage never rewrites saved maxima, repeated equipment or slot ordering.
  await enterEdit(page);
  await openMechTab(page);
  await expect(
    mechPanel(page).getByLabel("Armor CT", { exact: true }),
  ).toHaveValue("3");
  await expect(
    mechPanel(page).getByLabel("Weapon 1 name", { exact: true }),
  ).toHaveValue("Medium Laser");
  await expandEditSlots(page, "Left Arm");
  for (const [slot, value] of [
    [1, "Medium Laser"],
    [2, "Medium Laser"],
    [3, "-Empty-"],
    [4, ""],
  ] as const)
    await expect(
      mechPanel(page).getByLabel(`LA slot ${slot}`, { exact: true }),
    ).toHaveValue(value);
  await save(page); // Identical base mech must not invoke a reset.
  await expect(counterValue(page, "Heat")).toHaveText("2");
  await tap(page, "Decrease heat", 2);
  await tap(page, "Remove pilot hit");
  await expect(button(page, "Decrease heat")).toBeDisabled();
  await expect(button(page, "Remove pilot hit")).toBeDisabled();
  await tap(page, "Increase heat");
  await tap(page, "Add pilot hit");
  await tap(page, "Reset all damage");
  await expect(pointsCard(page, "Damage armor CT")).toContainText("3/3");
  await expect(pointsCard(page, "Damage structure Left Arm")).toContainText(
    "7/7",
  );
  await expect(counterValue(page, "Heat")).toHaveText("0");
  await expect(counterValue(page, "Pilot hits")).toHaveText("0");
  await expandViewSlots(page, "Left Arm");
  for (const slot of [1, 3, 4])
    await expect(
      button(page, `Critical hit Left Arm slot ${slot}`),
    ).toHaveAttribute("aria-pressed", "false");
  await apply(page);
  await reloadMech(page);
  await button(page, "Configure structure").click();
  await expect(
    mechPanel(page).getByRole("spinbutton", {
      name: "Structure max Left Arm",
      exact: true,
    }),
  ).toHaveValue("7");
  await expect(pointsCard(page, "Damage structure Left Arm")).toContainText(
    "7/7",
  );
  await expect(counterValue(page, "Heat")).toHaveText("0");
  await expect(counterValue(page, "Pilot hits")).toHaveText("0");
  await expandViewSlots(page, "Left Arm");
  expect(await slots.getByRole("listitem").allTextContents()).toEqual(names);
  await expect(button(page, "Critical hit Left Arm slot 1")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("base lowering/removal warns and resets persistently, keeping pilot hits hidden until reattachment", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setupManual(page, "base-reset");
  await seedDamage(page);
  await enterEdit(page);
  await openMechTab(page);
  await expect(
    mechPanel(page).getByRole("status").filter({ hasText: RESET_WARNING }),
  ).toHaveCount(0);
  await mechPanel(page).getByLabel("Armor CT", { exact: true }).fill("2");
  await expect(
    mechPanel(page).getByRole("status").filter({ hasText: RESET_WARNING }),
  ).toBeVisible();
  await save(page);
  await reloadMech(page);
  await expectMechReset(page, 2);

  await button(page, "Track structure").click();
  await mechPanel(page)
    .getByRole("spinbutton", { name: "Structure max Left Arm", exact: true })
    .fill("7");
  await tap(page, "Damage structure Left Arm");
  await tap(page, "Critical hit Left Arm slot 1");
  await tap(page, "Increase heat");
  await apply(page);
  await enterEdit(page);
  await openMechTab(page);
  await expandEditSlots(page, "Left Arm");
  await mechPanel(page)
    .getByRole("button", { name: "Remove Left Arm section", exact: true })
    .click();
  await expect(
    mechPanel(page).getByRole("status").filter({ hasText: RESET_WARNING }),
  ).toBeVisible();
  await save(page);
  await reloadMech(page);
  await expect(
    mechPanel(page).getByRole("region", {
      name: "Left Arm critical slots",
      exact: true,
    }),
  ).toHaveCount(0);
  await button(page, "Track structure").click();
  await expect(
    mechPanel(page).getByRole("spinbutton", {
      name: "Structure max Left Arm",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(counterValue(page, "Heat")).toHaveText("0");
  await expect(counterValue(page, "Pilot hits")).toHaveText("1");

  await tap(page, "Damage armor CT");
  await tap(page, "Increase heat");
  await apply(page);
  await enterEdit(page);
  await openMechTab(page);
  await mechPanel(page)
    .getByRole("button", { name: "Remove mech", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Remove this mech?" })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(
    mechPanel(page).getByRole("status").filter({ hasText: RESET_WARNING }),
  ).toBeVisible();
  await save(page);
  await reloadMech(page);
  await expect(
    mechPanel(page).getByText("No mech", { exact: true }),
  ).toBeVisible();
  await expect(button(page, "Apply damage")).toHaveCount(0);
  await expect(button(page, "Add pilot hit")).toHaveCount(0);
  // Hidden pilot state also survives an ordinary character save with no mech.
  await enterEdit(page);
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Retained pilot");
  await save(page);
  await addManualMech(page);
  await reloadMech(page);
  await expectMechReset(page, 3);
});

test("live catalog replacement clears damage/maxima/heat and preserves pilot hits", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setupManual(page, "catalog-reset");
  await seedDamage(page);
  await enterEdit(page);
  await openMechTab(page);
  const panel = mechPanel(page);
  await panel
    .getByRole("combobox", { name: "Search predefined mechs" })
    .fill("Firestarter");
  await panel.getByRole("option", { name: /^Firestarter FS9-H\b/ }).click();
  await page
    .getByRole("dialog", { name: "Replace current mech draft?" })
    .getByRole("button", { name: "Replace", exact: true })
    .click();
  await expect(panel.getByLabel("Chassis", { exact: true })).toHaveValue(
    "Firestarter",
    { timeout: 30_000 },
  );
  await expect(panel.getByLabel("Model", { exact: true })).toHaveValue("FS9-H");
  await expect(
    panel.getByRole("status").filter({ hasText: RESET_WARNING }),
  ).toBeVisible();
  await save(page);
  await reloadMech(page);
  await expect(
    mechPanel(page).getByRole("heading", { name: "Firestarter FS9-H" }),
  ).toBeVisible();
  await expectMechReset(page, 13);
  await button(page, "Track structure").click();
  const maxima = mechPanel(page).getByRole("spinbutton");
  await expect(maxima).toHaveCount(8);
  for (const input of await maxima.all()) await expect(input).toHaveValue("");
});

test("separate contexts adopt realtime, pin stale batches, and refuse stale full saves without overwriting damage", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const characterPath = await setupManual(page, "realtime");
  const { context, page: other } = await sharedSessionPage(browser, page);
  try {
    const joined = observeRealtimeJoin(other, characterPath);
    await other.goto(new URL(characterPath, page.url()).toString());
    await openMechTab(other);
    await joined();
    await tap(page, "Damage armor CT");
    await apply(page);
    // No goto/reload on B: only the real authenticated realtime path can adopt.
    await expect(pointsCard(other, "Damage armor CT")).toContainText("2/3", {
      timeout: 30_000,
    });
    await expect(mechPanel(other).getByRole("status")).toHaveText(
      "Damage is up to date.",
    );

    await tap(other, "Damage armor RTC");
    await tap(page, "Damage armor CT");
    await apply(page);
    await expect(mechPanel(other).getByRole("status")).toContainText(STALE, {
      timeout: 30_000,
    });
    await expect(pointsCard(other, "Damage armor CT")).toContainText("2/3");
    await expect(pointsCard(other, "Damage armor RTC")).toContainText("1/2");
    await expect(button(other, "Apply damage")).toBeDisabled();
    await expect(button(other, "Damage armor CT")).toBeDisabled();
    await expect(button(other, "Reset all damage")).toHaveCount(0);
    await tap(other, "Discard damage changes");
    await expect(mechPanel(other).getByRole("status")).toHaveText(
      "Damage is up to date.",
      { timeout: 30_000 },
    );
    await expect(pointsCard(other, "Damage armor CT")).toContainText("1/3");
    await expect(pointsCard(other, "Damage armor RTC")).toContainText("2/2");

    await enterEdit(other);
    await openMechTab(other);
    await mechPanel(other)
      .getByLabel("Chassis", { exact: true })
      .fill("Stale overwrite");
    await tap(page, "Damage armor CT");
    await tap(page, "Increase heat");
    await apply(page);
    await other.getByRole("button", { name: "Save", exact: true }).click();
    const conflict = other.getByRole("dialog", { name: "Remote changes" });
    await expect(conflict).toBeVisible({ timeout: 30_000 });
    await conflict
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(
      mechPanel(other).getByLabel("Chassis", { exact: true }),
    ).toHaveValue("Stale overwrite");
    await reloadMech(page);
    await expect(
      mechPanel(page).getByRole("heading", { name: "Damage Chassis DC-1" }),
    ).toBeVisible();
    await expect(pointsCard(page, "Damage armor CT")).toContainText("0/3");
    await expect(counterValue(page, "Heat")).toHaveText("1");
    // A fresh ordinary full save must not resend/clear separately stored damage.
    await enterEdit(page);
    await page.getByRole("tab", { name: "Sheet", exact: true }).click();
    await page
      .getByLabel("Name", { exact: true })
      .fill("Full save keeps damage");
    await save(page);
    await reloadMech(page);
    await expect(pointsCard(page, "Damage armor CT")).toContainText("0/3");
    await expect(counterValue(page, "Heat")).toHaveText("1");
  } finally {
    await context.close();
  }
});

test("no-mech saves have no controls; mobile damage targets, expansion and sticky Apply fit the viewport", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "mobile-nomech");
  await createBlankCharacter(page);
  await enterEdit(page);
  await page.getByLabel("Name", { exact: true }).fill("No Mech Pilot");
  await save(page);
  await reloadMech(page);
  await expect(
    mechPanel(page).getByText("No mech", { exact: true }),
  ).toBeVisible();
  await expect(mechPanel(page).getByRole("button")).toHaveCount(0);
  await expect(mechPanel(page).getByRole("spinbutton")).toHaveCount(0);
  await addManualMech(page);
  const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
  const region = mechPanel(page).getByRole("region", {
    name: "Left Arm critical slots",
    exact: true,
  });
  if (mobile) {
    const expand = region.getByRole("button", { expanded: false });
    await expect(expand).toBeVisible();
    await expect(button(page, "Critical hit Left Arm slot 1")).toBeHidden();
    const box = await expand.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expand.click();
    await expect(region.getByRole("button", { expanded: true })).toBeVisible();
  }
  await expect(button(page, "Critical hit Left Arm slot 1")).toBeVisible();
  await button(page, "Track structure").click();
  await mechPanel(page)
    .getByRole("spinbutton", { name: "Structure max Left Arm", exact: true })
    .fill("7");
  await tap(page, "Critical hit Left Arm slot 1");
  if (mobile) {
    const names = [
      "Damage armor CT",
      "Repair armor CT",
      "Damage structure Left Arm",
      "Repair structure Left Arm",
      "Critical hit Left Arm slot 1",
      "Increase heat",
      "Decrease heat",
      "Add pilot hit",
      "Remove pilot hit",
      "Apply damage",
      "Discard damage changes",
      "Reset all damage",
      "Done configuring structure",
    ];
    for (const name of names) {
      const box = await button(page, name).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
    }
    const maxBox = await mechPanel(page)
      .getByRole("spinbutton", { name: "Structure max Left Arm", exact: true })
      .boundingBox();
    expect(maxBox?.height).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    // Scroll the armor card, NOT Apply, into view. Sticky Apply must already be
    // reachable at the bottom without Playwright auto-scrolling its button.
    await button(page, "Damage armor CT").scrollIntoViewIfNeeded();
    await expect
      .poll(
        async () => {
          const box = await button(page, "Apply damage").boundingBox();
          const height = page.viewportSize()!.height;
          return (
            !!box && box.y >= height * 0.5 && box.y + box.height <= height + 1
          );
        },
        {
          message:
            "pending Apply stays in the lower half of the phone viewport",
        },
      )
      .toBe(true);
  }
  await apply(page);
  await reloadMech(page);
  await expandViewSlots(page, "Left Arm");
  await expect(button(page, "Critical hit Left Arm slot 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
