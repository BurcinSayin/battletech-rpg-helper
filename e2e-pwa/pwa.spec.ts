import { expect, test, type Page } from "@playwright/test";

// PWA specs. These run against a PRODUCTION build on port 3100 via
// playwright.pwa.config.ts (`npm run test:e2e:pwa`), because @serwist/next disables
// the service worker in development — running them on the dev-server harness would
// assert against a page that has no service worker at all.
//
// Preconditions, beyond `npm run build`: the local Supabase stack must be running
// and .env.local present. The build needs the Supabase env vars, and the cache
// boundary test signs in.

const PRECACHED_PREFIXES = ["/_next/static/", "/icons/", "/offline", "/manifest.webmanifest"];

/**
 * Waits until a service worker actually CONTROLS the page.
 *
 * `navigator.serviceWorker.ready` is not enough: it resolves on an active
 * registration while `controller` is still null on a first load, so assertions
 * gated on it can pass without a worker in charge of anything. Every offline
 * assertion below runs after this.
 */
async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true);
}

/** Every URL held in every cache, as pathnames. */
async function cachedPathnames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const perCache = await Promise.all(
      names.map(async (name) => {
        const keys = await (await caches.open(name)).keys();
        return keys.map((request) => new URL(request.url).pathname);
      }),
    );
    return perCache.flat();
  });
}

async function signUp(page: Page, prefix = "pwa") {
  const email = `e2e+${prefix}-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test("service worker registers and controls the page", async ({ page }) => {
  await page.goto("/offline");
  await waitForServiceWorkerControl(page);

  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.scope ?? null;
  });
  expect(scope).toMatch(/\/$/);
});

test("serves a manifest with the HUD colors and three icons", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.name).toBe("BattleTech RPG Helper");
  expect(manifest.short_name).toBe("BT Helper");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  // AC-3 names both colors explicitly.
  expect(manifest.background_color).toBe("#0a0a0b");
  expect(manifest.theme_color).toBe("#0a0a0b");

  expect(manifest.icons).toHaveLength(3);
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});

test("serves every icon as a real PNG", async ({ request }) => {
  // Includes the maskable variant and the apple-touch icon, which a check of only
  // the two "any" icons would miss.
  for (const url of [
    "/icons/192",
    "/icons/512",
    "/icons/512-maskable",
    "/apple-icon",
    "/icon",
  ]) {
    const response = await request.get(url);
    expect(response.status(), `${url} status`).toBe(200);
    expect(response.headers()["content-type"], `${url} content-type`).toContain("image/png");

    const body = await response.body();
    expect(body.length, `${url} body length`).toBeGreaterThan(1000);
    // PNG magic bytes — a blank or letterboxed render is still a large file, but a
    // non-image error page is not a PNG at all.
    expect(body.subarray(0, 4).toString("hex"), `${url} magic bytes`).toBe("89504e47");
  }
});

test("links the manifest, viewport and theme-color in the document head", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
});

test("precaches /offline, the manifest and the icons", async ({ page }) => {
  await page.goto("/offline");
  await waitForServiceWorkerControl(page);

  // A lower bound. The allow-list test below is an upper bound; without this, a
  // precache silently missing /offline would only surface as a side effect.
  const paths = await cachedPathnames(page);
  for (const expected of [
    "/offline",
    "/manifest.webmanifest",
    "/icons/192",
    "/icons/512",
    "/icons/512-maskable",
  ]) {
    expect(paths, `precache should contain ${expected}`).toContain(expected);
  }
});

test("renders /offline for both hard and soft navigation while offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);

  // Hard navigation to a never-visited, auth-gated route.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "BattleTech RPG Helper" })).toBeVisible();
  await expect(page.getByText(/reconnect to load your pilots/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();

  // Soft navigation: an in-app <Link> click is an RSC fetch, NOT a navigate-mode
  // request, so it matches no rule in the service worker. Recovery depends on
  // Next's MPA fallback in fetch-server-response.js, which is an internal marked
  // TODO-APP — this assertion is what would catch a Next upgrade changing it.
  await page.goto("/offline");
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByText(/reconnect to load your pilots/i)).toBeVisible();

  // The retry anchor works once the network is back.
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/(login|dashboard)$/);
});

test("caches nothing user-specific, even after sign-out", async ({ page }) => {
  // The security property, end to end. Authorization is RLS + auth cookies, so a
  // cached authenticated response would outlive sign-out and be readable by the
  // next person on a shared device.
  await page.goto("/");
  await waitForServiceWorkerControl(page);

  await signUp(page);
  await page.getByRole("button", { name: "+ New character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // An ALLOW-list, not a deny-list: any entry outside the precache surface fails,
  // including ones nobody anticipated. Compare pathnames — Serwist appends
  // ?__WB_REVISION__=<rev> to the cache key of every revisioned entry, so an
  // exact-URL comparison would fail on the entries this feature adds.
  const paths = await cachedPathnames(page);
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(
      PRECACHED_PREFIXES.some((prefix) => path.startsWith(prefix)),
      `unexpected cache entry: ${path}`,
    ).toBe(true);
  }
});

test("does not reload and discard unsaved edits when the network returns", async ({
  page,
  context,
}) => {
  // @serwist/next defaults reloadOnOnline to true, which would location.reload() on
  // every reconnect. The editor has no dirty tracking and no beforeunload guard, so
  // that is silent data loss on exactly the transition this feature exists for.
  await page.goto("/");
  await waitForServiceWorkerControl(page);

  await signUp(page, "reload");
  await page.getByRole("button", { name: "+ New character" }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "Edit" }).click();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Unsaved Pilot");

  await context.setOffline(true);
  await context.setOffline(false);
  // Give a reload, if one were triggered, time to happen.
  await page.waitForTimeout(1500);

  await expect(name).toHaveValue("Unsaved Pilot");
});
