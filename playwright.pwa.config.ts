import { defineConfig, devices } from "@playwright/test";

// PWA lane. Separate from playwright.config.ts for two reasons that are both
// load-bearing:
//
//  1. The service worker only exists in a production build (@serwist/next is
//     disabled in development), and `webServer` is config-level, not project-level,
//     so a single config cannot run one project against `next dev` and another
//     against `next start`.
//  2. PORT 3100, not 3000. This lane cannot reuse a running server, and sharing an
//     origin with the dev lane would (a) hard-error whenever a dev server is up and
//     (b) leave the production SW — skipWaiting + clientsClaim — controlling
//     localhost:3000 afterwards. Disabling SW generation in dev does not unregister
//     an already-installed worker.
//
// Specs live in e2e-pwa/ so the dev lane cannot pick them up by accident: filesystem
// separation instead of testIgnore/testMatch globs that fall out of sync.
//
// The production build runs once via the `pretest:e2e:pwa` npm script, NOT here.
// Iterating on a spec? Run `npx playwright test --config playwright.pwa.config.ts`
// directly to reuse the existing build.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e-pwa",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "pixel5", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `PORT=${PORT} npm run start`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
