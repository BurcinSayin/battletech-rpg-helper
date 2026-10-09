# Repository Guidelines

## Project Overview

BattleTech RPG character manager built with Next.js App Router, React, TypeScript, and Supabase. Supports desktop `.btcc` import/export, character editing, lifepath generation, campaigns, realtime updates, and an offline PWA fallback. Desktop format fidelity and database-enforced authorization are core constraints.

## Architecture & Data Flow

- Server Components fetch session-scoped Supabase data; client components handle forms and invoke `"use server"` actions. Auth guards live in `app/(app)/layout.tsx` and `app/(auth)/layout.tsx`. Root `middleware.ts` only delegates cookie/session refresh; never insert logic between Supabase client creation and `auth.getUser()`.
- `.btcc` text flows through `lib/btcc/parse.ts` → `lib/characters/import.ts` → draft/JSONB adapters in `lib/characters/mapping.ts` → RLS-gated insertion. Import preview is not trusted: actions reparse input server-side. Export uses `lib/btcc/serialize.ts`.
- Character saves validate values, refetch the stored row, merge editable fields with `formToDraft(rowToDraft(row), values)`, then call `update_character` with the expected version. `characters` intentionally has no direct table `UPDATE` grant/policy; do not bypass the RPC.
- RLS, RPC checks, and constraints—not UI visibility—enforce access. Campaign attachment requires the character owner's membership. Deleting membership atomically detaches their characters through a composite foreign key; the detach trigger increments character versions.
- `app/(app)/characters/[id]/use-character-realtime.ts` subscribes to character UPDATEs and reports newer versions to the editor. Keep per-subscription unique topics, exact-channel cleanup, and user-JWT authentication before subscribing. Version/callback refs avoid resubscribing on every keystroke.
- The wizard uses local reducer state in `app/(app)/characters/new/wizard/wizard-state.ts`; domain calculations live in `lib/characters/`. Completion is serialized, reparsed, and XP-reconciled server-side. `lib/rules/load.ts` bundles generated JSON catalogs rather than fetching rules over the network.
- `app/sw.ts` is service-worker glue; `lib/sw/config.ts` owns cache policy. Navigation is network-only with `/offline` fallback outside auth guards. Never precache authenticated/dynamic routes or import application/Supabase code into worker policy.

## Key Directories

| Path                           | Working boundary                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `app/(auth)/`, `app/(app)/`    | Auth/session guards, server pages/actions, editor and wizard clients                  |
| `lib/btcc/`, `lib/characters/` | Desktop format fidelity, row/draft/form adapters, XP and lifepath rules               |
| `lib/supabase/`, `supabase/`   | Typed client factories; migrations, RLS, database tests, generated seed               |
| `components/`                  | Reusable forms/sheets and Tailwind/shadcn UI primitives                               |
| `data/rules/`, `scripts/`      | Committed generated catalogs and their generators; regenerate instead of hand-editing |
| `lib/sw/`, `e2e-pwa/`          | Isolated service-worker policy and production-only PWA verification                   |
| `e2e/`                         | Browser workflows against the development server                                      |
| `docs/`                        | Desktop-rule evidence, intended design, rulebook inputs, and wireframes               |

## Development Commands

Run from the repository root with npm.

| Purpose                                       | Command                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Install locked dependencies                   | `npm ci`                                                                                      |
| Development                                   | `npm run dev`                                                                                 |
| Production build / serve                      | `npm run build` / `npm run start`                                                             |
| Typecheck app and worker                      | `npm run typecheck`                                                                           |
| Lint                                          | `npm run lint`                                                                                |
| Unit/component tests                          | `npm run test`                                                                                |
| Focused test / watch / coverage               | `npm run test -- lib/btcc/roundtrip.test.ts` / `npm run test:watch` / `npm run test:coverage` |
| Browser E2E                                   | `npm run test:e2e -- e2e/auth.spec.ts`                                                        |
| Production PWA E2E                            | `npm run test:e2e:pwa` (automatically builds first)                                           |
| Start local Supabase                          | `npx supabase start`                                                                          |
| Apply pending local migrations                | `npx supabase migration up --local`                                                           |
| RLS + concurrency checks                      | `npm run test:db`                                                                             |
| Concurrency checks only                       | `npm run test:db:concurrency`                                                                 |
| Regenerate database types                     | `npm run supabase:types`                                                                      |
| Regenerate catalogs / lifepath modules / seed | `npm run rules:ingest` / `npm run rules:extract` / `npm run seed:generate`                    |

- `npx supabase db reset` recreates the local database and loads `supabase/seed.sql`; use only for disposable data. Avoid `npm run supabase:start` when other local stacks matter: it runs `supabase stop --all` first.
- After schema changes, regenerate and commit `lib/supabase/database.types.ts`.
- Rules ingestion/extraction default to sibling `../Battletech-Character-Creator/resource`; `BTCC_SOURCE_DIR` overrides the **resource directory**, not the repository root. Extraction also reads desktop source files from its parent directory.
- `npm run skills:ingest` reads `docs/rule_book/skills_table.json` and `skills.json`; `npm run traits:ingest` regenerates traits. Rerun `rules:extract` after changing skill/subskill catalogs. Seed generation uses `lib/btcc/__fixtures__/lisa.btcc`; never hand-edit generated seed SQL or apply it to a real project.

## Code Conventions & Common Patterns

- Strict TypeScript; `@/*` resolves from the repository root. Use relative imports in `next.config.ts` and its helpers because config loading is outside webpack.
- Follow existing kebab-case module names and colocated `*.test.ts`/`*.test.tsx` tests. Prettier uses `prettier-plugin-tailwindcss`; preserve Tailwind class sorting. ESLint extends Next Core Web Vitals/TypeScript; generated `data/rules/**` is ignored.
- Validate action input with Zod `safeParse`. Expected validation/backend failures return typed, user-safe results; unexpected failures are logged with domain context and generalized. `lib/characters/errors.ts` classifies `PT409` as version conflict and `PT403` as forbidden campaign attachment/save.
- Compose domain helpers with session-bound Supabase factories at the boundary: server clients are per request; browser clients use the browser factory. Tests mock framework/client seams rather than adding a global dependency-injection layer.
- Client state stays local: React Hook Form for character forms, reducer state for the wizard, and transitions/pending state around async actions. Await writes before revalidation/redirects; preserve conflict handling rather than silently overwriting remote versions.
- `.btcc` serialization and JSONB ordering are compatibility-sensitive. Preserve fixed field order, intentional sorting/insertion order, verbatim notes, and pass-through equipment/weapons/pre* sections when merging forms. Legacy/variant catalog labels are warn-not-fail, not grounds to reject otherwise valid saves.

## Important Files

- `app/layout.tsx`, `app/page.tsx`, `app/(app)/dashboard/page.tsx`: application shell and landing/dashboard routes.
- `app/(app)/characters/actions.ts`, `lib/characters/schema.ts`, `lib/characters/mapping.ts`: authoritative persistence, form validation, and draft adapters.
- `lib/supabase/database.types.ts`, `supabase/migrations/`: generated DB contract and authorization/schema source of truth.
- `next.config.ts`, `lib/sw/next-options.ts`, `lib/sw/config.ts`: browser environment mapping, Serwist build options, and cache policy.
- `package.json`, `tsconfig.json`, `tsconfig.sw.json`, `eslint.config.mjs`, `.prettierrc`: commands and compilation/style boundaries. `next-env.d.ts` is Next-generated; do not edit manually.
- `docs/RULES.md`: desktop behavior, including observed defects, cited to `Battletech-Character-Creator@a1d8009`; not published-rulebook canon. `docs/PLAN.md` is intended design/build order, not progress. README contains marketing claims; use code, tests, Git history, and issues for implementation status.

## Runtime/Tooling Preferences

- Use Node.js and npm with committed `package-lock.json`; no Bun workflow or Node/npm version pin is declared in `package.json`. Dependencies currently target Next 15 and React 19.
- Copy `.env.example` to `.env.local` only if the latter does not exist. Fill `BT_CHARGEN_SUPABASE_URL` and `NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY` from the same project. Next's `env` mapping exposes the non-secret URL to browser bundles; restart dev/rebuild deployments after changes. Anon keys are public; RLS protects data.
- Leave `BT_CHARGEN_SUPABASE_SERVICE_ROLE_KEY` blank for ordinary development. Never prefix it with `NEXT_PUBLIC_` or add it to Next's `env` mapping. Preserve existing credentials and do not print secrets from Supabase status.
- Serwist is disabled in development. Do not add `--turbopack` to dev/build scripts: this integration does not support it. Generated `public/sw.js`/worker assets and TypeScript build metadata are ignored, not hand-maintained source.

## Testing & QA

- Vitest defaults to Node and discovers tests under `lib/`, `app/`, `components/`, and `scripts/`. DOM tests opt in with `// @vitest-environment jsdom` and use React Testing Library. Reset mocks and clean up rendered components; isolate fixtures.
- `lib/btcc/roundtrip.test.ts` guards golden byte equality and serialization stability. Preserve these compatibility tests; add behavior/boundary regressions rather than assertions tied to incidental wording or implementation.
- `npm run test:coverage` produces V8 text/HTML/JSON/LCOV reports for app/lib/components; no minimum coverage threshold is configured. Default Vitest does not run database specs or browser E2E. Extraction tests require the desktop checkout described above.
- Regular Playwright starts Next on port 3000 and may reuse a running server outside CI. Supabase must already have current migrations; signup tests require email confirmations disabled. Install Chromium with `npx playwright install chromium`. Use accessible labels/roles and unique disposable accounts; realtime tests need separate browser contexts. `PW_MOBILE=1` enables the optional Pixel 5 project.
- PWA Playwright uses production output on port 3100, runs desktop/Pixel 5 projects, and does not reuse a server. Wait for service-worker control before offline/cache assertions; development rendering cannot verify PWA behavior.
- `supabase/tests/rls_matrix_test.sql` uses pgTAP with authenticated-role/JWT contexts. Concurrency Vitest uses `vitest.db.config.ts`, serial files, isolated fixtures, and real PostgreSQL connections. Set `SUPABASE_TEST_DB_URL` to a direct local DB URL; its loopback guard prevents writes to remote databases.
- For changed user-facing behavior, exercise the actual surface in addition to relevant checks: auth redirects, save/conflict handling, cross-tab realtime updates, or production offline navigation. Rendering alone does not prove realtime initialization.

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
