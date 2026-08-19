# AGENTS.md

## Commands
- Use npm; `package-lock.json` is committed.
- Dev/build: `npm run dev`, `npm run build`, `npm run start`.
- Focused checks: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test -- lib/path/to/file.test.ts`.
- E2E: `npm run test:e2e -- e2e/name.spec.ts`; Playwright starts Next, but Supabase must already be running.
- Local Supabase: `npx supabase start`; reset/apply migrations and seed with `npx supabase db reset`.
- DB/RLS matrix: `supabase test db` runs `supabase/tests/rls_matrix_test.sql`.
- After schema changes, run `npm run supabase:types` and commit `lib/supabase/database.types.ts`.
- Regenerate `supabase/seed.sql` with `npm run seed:generate`; it is generated from the `.btcc` fixture.
- Regenerate rules JSON with `npm run rules:ingest`; source defaults to sibling `../Battletech-Character-Creator/resource`, override with `BTCC_SOURCE_DIR`.

## Architecture Gotchas
- Auth guards belong in `app/(app)/layout.tsx` and `app/(auth)/layout.tsx`; `middleware.ts` only refreshes Supabase cookies through `getUser()`.
- Do not add logic between Supabase middleware client creation and `auth.getUser()`; this can cause random logouts.
- RLS is the authorization boundary. UI affordances are not security.
- `characters` intentionally has no table `UPDATE` grant/policy. All character edits must go through the `update_character` RPC.
- Character saves are version-guarded: server refetches row, merges editable form fields with `formToDraft(rowToDraft(row), values)`, then calls `update_character`.
- `PT409` means version conflict; `PT403` means forbidden campaign attach/save; classification lives in `lib/characters/errors.ts`.
- Character JSONB ordering matters for desktop `.btcc` fidelity. Preserve pass-through sections such as equip/weapons/pre* unless intentionally changing round-trip behavior.
- `.btcc` parse/serialize fidelity is guarded by the golden round-trip tests in `lib/btcc/`.

## Current Status
- Trust `docs/PLAN.md`/code over README marketing language: campaigns/GM realtime, PWA/Serwist, and deploy polish are still pending.
- `app/(app)/campaigns/[id]/page.tsx` is currently a TODO stub.

## Style And Tests
- `@/*` maps to repo root.
- Vitest defaults to Node; component tests opt into jsdom with `// @vitest-environment jsdom`.
- `data/rules/**` is generated and lint-ignored.
- Prettier uses `prettier-plugin-tailwindcss`; keep Tailwind class sorting intact.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `app/` | App Router routes, layouts, and server actions (see `app/AGENTS.md`) |
| `components/` | Presentational React components (see `components/AGENTS.md`) |
| `lib/` | Domain core: `.btcc` format, character mapping, rules, Supabase clients (see `lib/AGENTS.md`) |
| `supabase/` | Local stack config, migrations, RLS test matrix, generated seed (see `supabase/AGENTS.md`) |
| `data/` | Generated rules catalogs, bundled at build time (see `data/AGENTS.md`) |
| `scripts/` | Generators for the rules JSON and `seed.sql` (see `scripts/AGENTS.md`) |
| `e2e/` | Playwright end-to-end specs (see `e2e/AGENTS.md`) |
| `docs/` | `PLAN.md` build-order source of truth + design wireframes (see `docs/AGENTS.md`) |

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
