# Repository Guidelines

BattleTech RPG character manager: Next.js App Router, React 19, TypeScript, Supabase. Core constraints: desktop `.btcc` format fidelity and database-enforced authorization. Run npm from the repo root.

## Architecture Invariants

- Auth guards are route-group layouts: `app/(app)/layout.tsx` sends anonymous users to `/login`; `app/(auth)/layout.tsx` sends signed-in users to `/dashboard`. Beyond sign-in, RLS and RPC checks enforce access, not UI visibility.
- `middleware.ts` only refreshes the session cookie (`lib/supabase/middleware.ts`). Its matcher deliberately skips the PWA surface and static assets. Never run code between client creation and `auth.getUser()`.
- `.btcc` import: `lib/btcc/parse.ts` → `lib/characters/import.ts` → `lib/characters/mapping.ts` → RLS-gated insert. Previews are untrusted; actions reparse raw text server-side. Export: `lib/btcc/serialize.ts`.
- Wizard (`app/(app)/characters/new/wizard/`): reducer state stays local. On finish, the client serializes the draft to `.btcc` text; `createWizardCharacter` reparses it and reconciles XP server-side before insert.
- Saves (`saveCharacter`, `app/(app)/characters/actions.ts`): Zod-validate, refetch the stored row, merge with `formToDraft(rowToDraft(row), values)`, then call `update_character` with the expected version. `characters` has no direct UPDATE grant or policy; never bypass the RPC. `PT409` is a version conflict; `PT403` is forbidden campaign attachment (`lib/characters/errors.ts`).
- Campaign membership: a composite FK `(campaign_id, owner_id)` → `campaign_members(campaign_id, user_id)` uses `ON DELETE SET NULL (campaign_id)`. A trigger bumps the character version on detach. Do not reimplement detach in app code.
- Realtime (`app/(app)/characters/[id]/use-character-realtime.ts`): subscribe to UPDATEs only. Call `realtime.setAuth` with the user's JWT before `subscribe()`. Use per-subscription unique topics and remove the exact channel on cleanup. Version and callback live in refs so keystrokes don't resubscribe.
- Desktop compatibility: preserve fixed `.btcc` field order, intentional sort/insert order, verbatim notes, and pass-through equipment/weapons/pre* sections. Legacy catalog labels warn (`catalogWarnings`); they never reject otherwise valid saves.
- `lib/rules/load.ts` bundles `data/rules/*.json` statically; the app never fetches rules.

## Conventions

- Use relative imports in `next.config.ts` and its helpers; config loading is outside webpack's `@/*` resolution.
- Server actions validate with Zod `safeParse`, return typed user-safe results for expected failures, and log unexpected errors with context before returning generic messages.
- Server Supabase clients are per request (`lib/supabase/server.ts`). Client state stays local: React Hook Form for character forms, reducer for the wizard. Await writes before `revalidatePath`/`redirect`; keep conflict handling.
- Prettier uses `prettier-plugin-tailwindcss`; keep Tailwind class order.

## Commands

- Dev/build/serve: `npm run dev`, `npm run build`, `npm run start`
- Typecheck app and service worker: `npm run typecheck`. Lint: `npm run lint`
- Unit/component tests: `npm run test`; focused: `npm run test -- lib/btcc/roundtrip.test.ts`
- Browser E2E: `npm run test:e2e -- e2e/auth.spec.ts`
- PWA E2E: `npm run test:e2e:pwa` (its `pretest` hook runs `build` first)
- DB: `npm run test:db` (pgTAP, then concurrency); concurrency only: `npm run test:db:concurrency`
- Local schema: `npx supabase migration up --local`; then `npm run supabase:types` and commit `lib/supabase/database.types.ts`
- Generators: `npm run rules:ingest`, `npm run skills:ingest`, `npm run traits:ingest`, `npm run rules:extract`, `npm run seed:generate`

## Gotchas

- `npm run supabase:start` runs `supabase stop --all` first, killing other local stacks. Use `npx supabase start`.
- `npx supabase db reset` loads `supabase/seed.sql`. Use only on disposable data. Seed is generated from `lib/btcc/__fixtures__/lisa.btcc`; never hand-edit it or apply it to a real project.
- Env: copy `.env.example` to `.env.local` only if absent. `BT_CHARGEN_SUPABASE_URL` is unprefixed and reaches the browser only via `next.config.ts`'s `env` mapping. `NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY` is public; RLS protects data. `BT_CHARGEN_SUPABASE_SERVICE_ROLE_KEY` stays blank for development. Never `NEXT_PUBLIC_`-prefix it or add it to `env`. Restart after env changes. Never print secrets from `supabase status`.
- Rules generators read the desktop checkout. `BTCC_SOURCE_DIR` overrides the **resource** directory (default `../Battletech-Character-Creator/resource`); `rules:extract` also reads C++ sources from that checkout's root. After changing skill or subskill catalogs, rerun `rules:extract`.
- Never add `--turbopack`: @serwist/next does not support it and silently emits no worker. Serwist is disabled in development, so PWA behavior is verifiable only in production builds.
- `data/rules/**` and seed SQL are generated; regenerate instead of editing. Generated `public/sw.js*` and tsbuildinfo are ignored.
- `docs/RULES.md` documents desktop behavior, including defects; it is evidence, not rulebook canon. `docs/PLAN.md` is intended design, not progress. Check code, tests, and git history for status.

## Service Worker

- `app/sw.ts` is glue. Cache policy lives in `lib/sw/config.ts`, which may import only `serwist` (anything else bundles into the worker). Read the comments there before changing `runtimeCaching`, fallbacks, or plugins.
- Never precache authenticated or dynamic routes. `additionalPrecacheEntries` in `lib/sw/next-options.ts` replaces the `public/` glob scan; explicitly list new public assets only if they need precaching.
- `/offline` stays outside auth guards and must remain precached.

## Testing

- Root Vitest runs Node by default and discovers `lib/`, `app/`, `components/`, `scripts/` tests only. DOM tests opt in with `// @vitest-environment jsdom` and use React Testing Library. Root Vitest excludes `supabase/tests/` and `e2e/`.
- Extraction tests require the external desktop checkout described above.
- `lib/btcc/roundtrip.test.ts` guards golden `.btcc` bytes. Keep it green; add behavior regressions, not assertions tied to wording.
- DB: `supabase/tests/rls_matrix_test.sql` is pgTAP run by `supabase test db`. `vitest.db.config.ts` runs `supabase/tests/**/*.test.ts` serially against real Postgres. `SUPABASE_TEST_DB_URL` must be the direct local DB URL; the suite refuses non-loopback hosts because it writes fixtures.
- Browser E2E (`e2e/`): needs migrated local Supabase and email confirmations disabled (signup yields a session). Port 3000 reuses a running server outside CI. Install with `npx playwright install chromium`. Use accessible roles, unique disposable accounts, and separate contexts for realtime. `PW_MOBILE=1` adds the Pixel 5 project.
- PWA E2E (`e2e-pwa/`): production build on port 3100; never reuses a server. Wait for `navigator.serviceWorker.controller` before offline or cache assertions.
- For user-facing changes, exercise the surface: auth redirects, save/conflict, cross-tab realtime, production offline navigation. Rendering alone does not prove realtime.

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
