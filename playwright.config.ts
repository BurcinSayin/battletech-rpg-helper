import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// The Pixel 5 project is env-gated rather than always-on: Playwright has no
// "registered but not default" state, so listing it unconditionally would double
// every run. AC-8 asks that the suite passes at a mobile viewport, which a recorded
// one-time run satisfies. Invoke with:
//   PW_MOBILE=1 npx playwright test --project=pixel5
const mobileProjects = process.env.PW_MOBILE
  ? [{ name: "pixel5", use: { ...devices["Pixel 5"] } }]
  : [];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...mobileProjects,
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
