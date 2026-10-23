# Repository Guidelines

## Project Overview

BattleTech RPG character and campaign manager: a Next.js App Router / React 19 / TypeScript / Supabase port of the desktop BattleTech Character Creator. Includes an installable PWA, inventory/loadout editing, and manual mech damage tracking. Core constraints: desktop `.btcc` fidelity, database-enforced authorization, and version-checked writes.

## Architecture & Data Flow

- **Auth:** `app/(app)/layout.tsx` redirects anonymous users to `/login`; `app/(auth)/layout.tsx` redirects signed-in users to `/dashboard`. `middleware.ts` only refreshes session cookies through `lib/supabase/middleware.ts`; its matcher excludes static/PWA assets and `/offline`. Never insert work between Supabase client creation and `auth.getUser()`. RLS and RPC checks—not UI visibility—enforce access.
- **Import/export:** `.btcc` text → `lib/btcc/parse.ts` → `lib/characters/import.ts` → `lib/characters/mapping.ts` → RLS-gated insert. Client previews are untrusted; server actions reparse raw text. Export uses `lib/btcc/serialize.ts`. Preserve fixed field order, intentional sort/insert order, verbatim notes, and pass-through equipment/weapons/pre* sections. Legacy catalog labels produce `catalogWarnings`, not save rejection.
- **Wizard:** `app/(app)/characters/new/wizard/` keeps reducer state local. Finish serializes the draft to `.btcc`; `createWizardCharacter` reparses and reconciles XP server-side before insertion.
- **Character saves:** `saveCharacter` in `app/(app)/characters/actions.ts` Zod-validates, refetches the stored row, merges with `formToDraft(rowToDraft(row), values)`, and calls `update_character` with the expected version. There is no direct character UPDATE grant/policy; never bypass the RPC. `PT409` means conflict; `PT403` means forbidden campaign attachment (`lib/characters/errors.ts`). Preserve presence semantics: omitted campaign/mech means unchanged; `{ id: null }` detaches a campaign; `null` removes a mech.
- **Campaign membership:** the composite FK `(campaign_id, owner_id)` → `campaign_members(campaign_id, user_id)` uses `ON DELETE SET NULL (campaign_id)`; a trigger bumps the character version on detach. Do not reimplement detach in app code. Keep the explicit refusal to leave a campaign as its GM.
- **Realtime:** `app/(app)/characters/[id]/use-character-realtime.ts` subscribes to UPDATEs only. Set the user's JWT with `realtime.setAuth` before subscribing, use unique subscription topics, and remove the exact channel on cleanup. Version/callback refs prevent keystrokes from resubscribing. Remote updates must not silently rebase active edits.
- **Inventory:** `lib/btcc/inventory.ts` provides lossless raw-row views/builders; `lib/characters/inventory.ts` handles editing and totals. Imported values remain authoritative even when a catalog alias matches. Preserve unknown/malformed rows and ambiguous name-based loadout references; do not normalize them away. Cost/mass are stack totals; reload values are not extra totals. New purchases require explicit unresolved values and must respect desktop integer/delimiter limits.
- **Mechs:** `lib/mech/` separates catalog/MTF parsing, shape validation, and damage calculations. Catalog downloads stay server-side, constrained to catalog filenames and bounded untrusted input. Shape validation is not construction-legality checking. Damage uses the separate version-guarded `update_character_mech_damage` RPC and never enters `.btcc`. Any distinct base-mech change resets mech-specific damage/maxima but preserves pilot hits; a normal save with an unchanged mech does not reset damage.
- **Rules:** `lib/rules/load.ts` statically bundles `data/rules/*.json`; the app never fetches rules. Catalog data is not a combat-rules evaluator.

## Key Directories

| Directory                                                         | Responsibility                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                                            | Route-group auth guards, Server Components, domain server actions, local editor/wizard clients; top-level auth callback, reset, and offline routes. |
| `components/characters/`, `components/auth/`, `components/ui/`    | Domain UI and shared primitives; keep persistence in server actions and calculations in library helpers.                                            |
| `lib/btcc/`, `lib/characters/`, `lib/mech/`                       | Desktop wire format, draft/DB/form mapping and inventory logic, mech parsing/damage.                                                                |
| `lib/supabase/`, `lib/campaigns/`, `lib/auth/`, `lib/validation/` | Request/browser clients, generated DB types, domain schemas and access/error helpers.                                                               |
| `lib/rules/`, `data/rules/`, `docs/rule_book/`, `scripts/`        | Typed catalog access, generated JSON, reviewed source transcriptions/mappings, and generators.                                                      |
| `supabase/migrations/`, `supabase/tests/`, `e2e/`, `e2e-pwa/`     | Schema/RLS/RPC evolution, database checks, browser behavior, and isolated production PWA checks.                                                    |

## Development Commands

Run from the repository root after `npm install`.

| Task                                              | Command                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Develop / build / serve production                | `npm run dev` / `npm run build` / `npm run start`                  |
| Typecheck app **and** worker / lint               | `npm run typecheck` / `npm run lint`                               |
| Unit/component tests / watch / coverage           | `npm test` / `npm run test:watch` / `npm run test:coverage`        |
| Focused regression                                | `npm run test -- lib/btcc/roundtrip.test.ts`                       |
| Browser E2E                                       | `npm run test:e2e -- e2e/auth.spec.ts`                             |
| Production PWA E2E, including automatic pre-build | `npm run test:e2e:pwa`                                             |
| pgTAP then DB concurrency / concurrency only      | `npm run test:db` / `npm run test:db:concurrency`                  |
| Start local Supabase safely                       | `npx supabase start`                                               |
| Apply local migrations, then regenerate types     | `npx supabase migration up --local`, then `npm run supabase:types` |

Generator workflows:

- `npm run skills:ingest`, `npm run traits:ingest`, and `npm run equipment:ingest` read checked-in `docs/rule_book/` sources without the desktop checkout. Equipment consumes `Warriors-Catalog/` tables and `equipment-mapping.json`; regenerate skills first when changing weapon-skill names.
- `npm run rules:ingest` runs those parsers plus desktop `.dat` ingestion. `BTCC_SOURCE_DIR` overrides the desktop **resource directory**, default `../Battletech-Character-Creator/resource`. `npm run rules:extract` also needs C++ stage sources in the checkout root; rerun it after skill/subskill changes to refresh `data/rules/modules.json`.
- `npm run seed:generate` derives `supabase/seed.sql` from `lib/btcc/__fixtures__/lisa.btcc`. Never hand-edit generated catalogs/seed. After schema changes, commit migrations and regenerated `lib/supabase/database.types.ts` together.

## Code Conventions & Common Patterns

- Strict TypeScript; follow existing kebab-case filenames and PascalCase React components. Use `@/*` imports in application code, but relative imports in `next.config.ts` and its helpers: config loading is outside webpack alias resolution.
- Prettier uses `prettier-plugin-tailwindcss`; preserve Tailwind class ordering. ESLint uses Next's Core Web Vitals and TypeScript rules.
- Server actions accept untrusted input, use Zod `safeParse`, and return typed user-safe results for expected failures. Log unexpected failures with domain context before returning generic messages; never expose raw Supabase errors.
- Create server Supabase clients per request (`lib/supabase/server.ts`). Await writes before `revalidatePath`/`redirect`; retain optimistic-conflict handling. Keep domain calculations in pure helpers with explicit inputs rather than adding global state or a dependency-injection framework.
- Client state stays local: React Hook Form for character forms, a reducer for the wizard, staged inventory/damage changes until explicit commit, and `useTransition` for async actions. Switching editor tabs must retain the draft; stale edits/damage batches must conflict rather than overwrite newer state.
- Password-reset responses must not disclose account existence. `app/auth/callback/route.ts` restricts `next` to safe relative paths. Preserve the recovery-session flow and sign out after a successful password change.

## Important Files

- `app/layout.tsx`, `app/page.tsx`: root shell and session-aware entry routing.
- `next.config.ts`, `lib/sw/next-options.ts`: Next/Serwist integration, build-time public URL mapping, explicit precache entries.
- `app/sw.ts`, `lib/sw/config.ts`: worker glue versus cache policy. Read policy comments before touching handlers/plugins/fallbacks.
- `tsconfig.json`, `tsconfig.sw.json`: separate application and Web Worker compilation; `npm run typecheck` covers both.
- `vitest.config.ts`, `vitest.db.config.ts`, `playwright.config.ts`, `playwright.pwa.config.ts`: distinct test lanes and runtime prerequisites.
- `.env.example`, `supabase/config.toml`, `package.json`: environment template, local service configuration, executable command definitions.
- `README.md`: setup and current equipment/inventory behavior. `docs/MECH_DAMAGE.md`: apply/discard, conflict, reset and replacement semantics. `docs/RULES.md` records desktop behavior, including defects—not rulebook canon. `docs/PLAN.md` describes intended design, not progress; verify status against code/tests/history.

## Runtime/Tooling Preferences

- Use Node.js and npm; README specifies Node 18+, and `package-lock.json` is present. `bun.lock` does not establish a Bun-only workflow. Generators run via `tsx` package scripts. Use shell-appropriate environment syntax; `PW_MOBILE=1 ...` is Bash syntax, not PowerShell.
- Copy `.env.example` to `.env.local` only if absent. `BT_CHARGEN_SUPABASE_URL` reaches the browser via Next's explicit `env` mapping; `NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY` is public and RLS protects data. Leave `BT_CHARGEN_SUPABASE_SERVICE_ROLE_KEY` blank in development; never prefix it with `NEXT_PUBLIC_` or add it to Next's `env`. Restart after environment changes. Never print secrets from `supabase status`.
- **Avoid destructive local helpers:** `npm run supabase:start` executes `supabase stop --all`, killing other local stacks; prefer `npx supabase start`. `npx supabase db reset` loads generated test-account seed data: disposable local databases only, never a real project.
- **Do not add `--turbopack`:** Serwist does not support it and silently emits no worker. Serwist is disabled in development; verify PWA behavior with a production build. Generated `public/sw.js*` and `*.tsbuildinfo` are ignored.
- `lib/sw/config.ts` may import only `serwist`, not application modules. Keep its nonempty `NetworkOnly` navigation rule paired with navigation preload so offline fallback works without caching authenticated pages; handler error plugins can silently disable fallback. Never precache authenticated/dynamic routes. Explicit entries in `lib/sw/next-options.ts` replace public-asset scanning; add assets deliberately. `/offline` must remain outside auth guards and precached. Keep reconnect auto-reload disabled to protect unsaved work.

## Testing & QA

- Root Vitest runs Node tests in `lib/`, `app/`, `components/`, and `scripts/`; database and browser suites are separate. DOM tests opt in with `// @vitest-environment jsdom` and React Testing Library. V8 coverage targets `lib/`, `app/`, and `components/`; no coverage threshold is configured.
- Preserve byte-equal golden checks in `lib/btcc/roundtrip.test.ts`. Add behavior/boundary regressions, not wording or incidental implementation assertions. Desktop extraction tests require the external checkout used by `rules:extract`.
- Database checks include `supabase/tests/rls_matrix_test.sql` (pgTAP) and serial real-Postgres concurrency tests via `vitest.db.config.ts`. `SUPABASE_TEST_DB_URL` must be the direct local DB URL; concurrency tests reject non-loopback hosts because they write fixtures. Apply migrations before running them.
- Browser E2E needs local Supabase with migrations and email confirmations disabled so signup yields a session. Install Chromium with `npx playwright install chromium`. Port 3000 reuses a server outside CI; `PW_MOBILE=1` adds Pixel 5. Use accessible roles, unique disposable accounts, and separate user contexts for realtime. Mech catalog E2E also needs external catalog network access.
- PWA E2E uses production port 3100, never reuses a server, and runs desktop/mobile separately from dev E2E to avoid persistent-worker interference. Wait for `navigator.serviceWorker.controller`, not merely worker readiness, before offline/cache assertions.
- Exercise changed user-facing paths: auth redirects/recovery, inventory and save/conflict handling, mech Apply/Discard, cross-tab realtime, or production offline navigation as applicable. Rendering alone does not prove synchronization or persistence.

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
