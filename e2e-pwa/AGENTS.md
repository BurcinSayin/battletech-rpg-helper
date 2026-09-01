<!-- Parent: ../AGENTS.md -->

# e2e-pwa

## Purpose
Playwright specs for the PWA surface: service-worker registration, the web app manifest and its
code-rendered icons, the `/offline` fallback, and the two properties that are easy to break
silently — the cache boundary and the reconnect behaviour.

## Key Files
| File | Description |
|------|-------------|
| `pwa.spec.ts` | Eight tests: SW control, manifest fields, icon bytes, `<head>` tags, precache contents, offline fallback on hard *and* soft navigation, the post-sign-out cache allow-list, and the unsaved-edits-survive-reconnect regression. |

## For AI Agents

### Why this directory exists at all
`@serwist/next` disables the service worker under `next dev`, and the main harness
(`playwright.config.ts`) starts `npm run dev`. A PWA spec run there asserts against a page with no
service worker — it passes and proves nothing. So these specs need their own config with a
production-build server, and `webServer` is config-level rather than project-level in Playwright.

The separation is by **directory**, not by `testIgnore`/`testMatch` globs. Globs in two configs fall
out of sync: a second spec added here would be silently picked up by the dev lane and silently
skipped by this one. `testDir` makes that impossible.

### Working In This Directory
- Run with `npm run test:e2e:pwa`. The `pretest:e2e:pwa` script builds first; to iterate on a spec
  without rebuilding, call `npx playwright test --config playwright.pwa.config.ts` directly.
- **Port 3100, not 3000.** This lane cannot reuse a running server, so sharing the dev port would
  hard-error whenever a dev server is up — and, worse, would leave the production service worker
  (`skipWaiting` + `clientsClaim`) controlling `localhost:3000` afterwards. Disabling SW generation
  in dev does not unregister an already-installed worker.
- Preconditions: `.env.local` present and `npx supabase start` running. The build needs the Supabase
  env vars, and two specs sign up.
- **Always gate offline assertions on `waitForServiceWorkerControl`**, never on
  `navigator.serviceWorker.ready` alone — `ready` resolves on an active registration while
  `controller` is still null on a first load.

### Common Patterns
- Compare cache entries by `new URL(u).pathname`, never by full URL: Serwist appends
  `?__WB_REVISION__=<rev>` to the cache key of every revisioned entry.
- The cache assertion is an **allow-list** (everything must be under `/_next/static/`, `/icons/`,
  `/offline`, `/manifest.webmanifest`), not a deny-list of known-bad origins. A deny-list fails open
  on anything nobody thought of.
- Do not write `new Request(url, { mode: "navigate" })` — the Fetch spec forbids it and it throws.
  Use a duck-typed stub, as `lib/sw/config.test.ts` does.

### Testing Requirements
- Not part of the Vitest run; `vitest.config.ts` includes only `*.test.ts(x)`.
- Verified red-green: flipping `reloadOnOnline` to `true` turns the reconnect test red, prepending a
  `NetworkFirst` page rule turns the cache allow-list red, and dropping `/offline` from
  `additionalPrecacheEntries` turns the precache test red.

## Dependencies

### Internal
- `lib/sw/config.ts`, `lib/sw/next-options.ts` — what these specs verify at runtime
- `app/offline/page.tsx`, `app/manifest.ts`, `app/icons/*`

### External
- `@playwright/test`; a production build (`npm run build`); a local Supabase stack
