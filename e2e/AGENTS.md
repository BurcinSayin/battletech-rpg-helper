<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# e2e

## Purpose
Playwright end-to-end specs covering the flows that unit tests cannot: real auth against Supabase,
a full character create/edit/save round-trip through the version-guarded RPC, and `.btcc` file
import via an actual file input.

## Key Files
| File | Description |
|------|-------------|
| `smoke.spec.ts` | Landing page renders. The only spec that needs no database. |
| `auth.spec.ts` | Anonymous `/dashboard` redirects to `/login`, then sign up → dashboard → sign out. |
| `character-editor.spec.ts` | Create blank character → edit → save → reload and confirm persistence. |
| `character-import.spec.ts` | Upload `lib/btcc/__fixtures__/lisa.btcc` → preview → persist. |

## For AI Agents

### Working In This Directory
- **Playwright starts Next, but it does not start Supabase.** `playwright.config.ts` has a
  `webServer` block running `npm run dev` on port 3000 and reusing an existing server outside CI.
  The database is your responsibility: run `npx supabase start` first, or every spec except
  `smoke` fails at signup.
- Two preconditions beyond "Supabase is up":
  1. Migrations applied (`npx supabase db reset`).
  2. **Email confirmations disabled** — the specs rely on signup establishing a session
     immediately and landing on `/dashboard`.
- Specs self-provision their user with a unique address, `e2e+${Date.now()}@example.com`, so they
  are independent and safely parallel (`fullyParallel: true`). Do not introduce a shared fixture
  user; that reintroduces ordering coupling.
- Chromium only, `retries: 2` in CI and `0` locally, `trace: "on-first-retry"`.

### Testing Requirements
- All specs: `npm run test:e2e`. One spec: `npm run test:e2e -- e2e/character-editor.spec.ts`.
- These files are **not** part of the Vitest run — `vitest.config.ts` only includes
  `*.test.ts`/`*.test.tsx`, and explicitly excludes `e2e/**` from coverage.
- `forbidOnly` is set in CI, so a stray `test.only` fails the build rather than silently narrowing
  the suite.

### Common Patterns
- Locate elements by accessible role and label (`getByRole`, `getByLabel`) rather than CSS
  selectors, which keeps the specs honest about accessibility.
- Assert navigation with URL regexes, e.g. `expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/)`.
- Resolve fixture paths from the repo root with `path.resolve("lib/btcc/__fixtures__/…")`.

## Dependencies

### Internal
- `lib/btcc/__fixtures__/lisa.btcc` — upload payload for the import spec
- The running app, including all server actions in `app/(app)/characters/actions.ts`

### External
- `@playwright/test`
- A local Supabase stack (`npx supabase start`)

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
