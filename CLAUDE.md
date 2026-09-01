# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (http://localhost:3000)
npm run build            # Production build
npm run start            # Serve production build

npm run typecheck        # tsc --noEmit (strict)
npm run lint             # next lint

npm run test             # Vitest, run once
npm run test:watch       # Vitest, watch mode
npm run test:e2e         # Playwright (auto-starts the dev server)
npm run test:e2e:pwa     # PWA specs (e2e-pwa/) against a production build on :3100
npm run test:db          # pgTAP RLS matrix (needs the local Supabase stack up)
```

- **Single unit test:** `npm run test -- lib/path/to/x.test.ts`. Unit tests live in `lib/**/*.test.ts` and `app/**/*.test.ts`.
- **Single e2e test:** `npm run test:e2e -- e2e/x.spec.ts`. E2E specs live in `e2e/`.
- **Mobile viewport run:** `PW_MOBILE=1 npx playwright test --project=pixel5`. The Pixel 5 project is
  env-gated so it does not double every default run.
- **PWA specs:** `npm run test:e2e:pwa` (specs in `e2e-pwa/`). Needs `.env.local` and the Supabase
  stack — it builds and signs in.
- **Database tests:** `npm run test:db` runs `supabase/tests/*.sql` through pgTAP. Requires `npx supabase start` and all migrations applied.

### Data / Supabase commands

```bash
npm run supabase:types   # Regenerate lib/supabase/database.types.ts from the local DB
npm run seed:generate    # Regenerate supabase/seed.sql from the .btcc fixture (then run npx supabase db reset)
npm run rules:ingest     # Convert desktop .dat files to data/rules/*.json (see Rules catalog below)
```

## Environment & local stack

Copy `.env.example` → `.env.local` and set: `BT_CHARGEN_SUPABASE_URL`, `NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY`, `BT_CHARGEN_SUPABASE_SERVICE_ROLE_KEY` (server-only), `DB_PASS`.

The `BT_CHARGEN_` prefix is what the Vercel Supabase integration provisions, and it is what the code actually reads (`lib/supabase/client.ts`, `lib/supabase/middleware.ts`). The project URL arrives **without** a `NEXT_PUBLIC_` prefix, so `next.config.ts` bridges it into the client bundle via its `env` key — keep the two in sync if it is ever renamed. Getting these names wrong fails loudly: `createBrowserClient` throws when the URL or key is falsy.

Local Supabase runs via the CLI, installed as a devDependency and invoked with `npx supabase` (or from npm scripts, where `supabase` resolves to the local binary). `npx supabase start` brings up the stack: Studio on :54323, API on :54321, Postgres on :54322. Migrations are in `supabase/migrations/`; `npx supabase db reset` re-applies all migrations plus `supabase/seed.sql`. After changing the schema, run `npm run supabase:types` to keep the generated types in sync.

## Architecture

BattleTech "A Time of War" RPG character helper: Next.js 15 (App Router) + React 19 + TypeScript (strict) on Supabase, with a design goal of byte-compatible round-trip with the desktop C++/Qt `.btcc` format.

**Routing & auth.** Route groups split protected and guest areas: `app/(app)/` requires a session, `app/(auth)/` is for guests. Auth guards live in the **layouts** (`getUser()` → redirect), not in middleware. `middleware.ts` only refreshes the Supabase session cookie via `getUser()` — keep it logic-free (running code between client creation and `getUser()` can cause random logouts). Auth is via Supabase server actions in `app/(auth)/actions.ts`; auth errors are deliberately sanitized to avoid account enumeration.

**Supabase clients** (`lib/supabase/`): `client.ts` (browser, anon key, `@supabase/ssr`), `server.ts` (per-request, cookie-based, never cached). Generated DB types live in `lib/supabase/database.types.ts` (committed).

**Security model = RLS + RPC.** RLS is the authoritative access layer; the UI only hides affordances. `SECURITY DEFINER` helpers (`is_campaign_gm`, `is_campaign_member`, `shares_campaign`) with an empty `search_path` are used inside policies to avoid RLS recursion. Critically, **characters have no RLS UPDATE policy** — updates must go through the `update_character` RPC; inserts and deletes go direct through RLS-gated table access. All of this is defined (and heavily commented) in `supabase/migrations/20260629150000_init.sql`.

**Version-guarded save (optimistic concurrency)** is the central pattern for character edits:

1. `app/(app)/characters/[id]/page.tsx` — server component fetches the row (RLS-gated), maps it with `rowToDraft`, and passes `version` + draft to the client.
2. `app/(app)/characters/[id]/editor-client.tsx` — react-hook-form editor; holds `version` from props (only updated after a successful server save).
3. `saveCharacter()` in `app/(app)/characters/actions.ts` — **re-fetches the row server-side**, merges the edited form fields over untouched sections via `formToDraft(rowToDraft(row), values)`, then calls `update_character(p_id, p_expected_version, p_payload)`.

A stale `expectedVersion` yields Postgres error `PT409` → `ConflictDialog` (reload vs. keep editing); a lost campaign permission yields `PT403`. Error classification is in `lib/characters/errors.ts` (`classifyUpdateError`). The server re-fetch is what keeps sections the MVP editor never touches (equip/weapons/pre*) in sync.

**Mapping layer** (`lib/characters/mapping.ts`): `rowToDraft` / `formToDraft` / `draftToPayload` / `draftToInsert`. `draftToPayload` whitelists columns; equip/weapons/pre* sections pass through verbatim for lossless fidelity. Character document data is stored as JSONB specifically to preserve field ordering for desktop compatibility.

**`.btcc` desktop compatibility** (`lib/btcc/`): parse/serialize aims for a byte-compatible round-trip with the desktop app. There's a golden round-trip test guarding parse → serialize fidelity.

**Rules catalog** (`lib/rules/load.ts`): static JSON in `data/rules/`, bundled at build time (available offline). Generated by `npm run rules:ingest` from a sibling `../Battletech-Character-Creator` checkout (override source with `BTCC_SOURCE_DIR`). Catalog mismatches **warn, not fail** (`catalogWarnings` in the validation layer).

**XP math** (`lib/characters/xp.ts`): matches the desktop. All 8 attributes are charged at **full face value** (`mainwindow.cpp:830-833`), so an all-100 character consumes 800 XP — `ATTRIBUTE_BASE = 100` is the desktop starting value and the fallback for a missing attribute, **not** a discount. Budget is 5000 (`CHARACTER_START_XP`, `chardata.cpp:7`). `gmxpmod` is a **term in the budget** (`remaining = budget - spent - gmxpmod`), mirroring the desktop's derived `wizardMod` (`mainwindow.cpp:397-401`). Negative skill/trait XP refunds. See `docs/RULES.md` §2.2 and §2.5. Do not reintroduce the "only the excess costs XP" or "`gmxpmod` is display-only" readings — both were defects, corrected in step 10.

**PWA / offline** (`lib/sw/`, `app/sw.ts`, `app/manifest.ts`, `app/offline/`): Serwist ships a
service worker that **precaches build output plus five explicit URLs and nothing else**. The cache
boundary is a security property, not a performance one: authorization is RLS + auth cookies, so any
authenticated response the worker retained would outlive sign-out on a shared device. Navigations
get a single `NetworkOnly` strategy — which cannot write to a cache — whose only job is to route
failures to the precached `/offline` page; Supabase requests match no rule at all. `lib/sw/config.ts`
exports a *factory*, not an options bag, so `app/sw.ts` has no spread to inject policy through, and
`lib/sw/config.test.ts` asserts the whole invariant in the ordinary `npm run test` lane.

Three things here are load-bearing and easy to "clean up" into breakage:
- **`next.config.ts` imports `./lib/sw/next-options` and `app/sw.ts` imports `../lib/sw/config` —
  both relative, deliberately.** The `@/*` alias cannot resolve from `next.config.ts` (it is loaded
  outside webpack) and rewriting it there breaks the build. Both are relative so the pair stays
  consistent. These are the only two intentional exceptions to the `@/*` convention.
- **Never add `--turbopack` to `dev`/`build`.** `@serwist/next` does not support it and silently
  emits no service worker.
- **`additionalPrecacheEntries` replaces `@serwist/next`'s `public/` glob scan rather than adding to
  it.** `public/` holds only `.gitkeep` today; the first asset added there must be listed in
  `lib/sw/next-options.ts` by hand or it is silently not precached.

The `/offline` page's retry control is a plain `<a>`, not `<Link>`, with an ESLint disable: the
worker serves that document in response to a navigation to a *different* URL, so React hydrates
against a mismatched pathname and a JS handler may never attach.

**Validation**: react-hook-form + Zod (`lib/characters/schema.ts`, `lib/auth/schema.ts`). Forms validate client-side, then server actions re-validate before writing. There is no global state library — state is component-local (react-hook-form + `useState`).

## Conventions

- Custom Postgres error codes: `PT409` (version conflict), `PT403` (forbidden).
- ESLint: unused vars prefixed with `_` are allowed; `data/rules/**` (generated) is lint-ignored. Prettier auto-sorts Tailwind classes. `@/*` path alias → repo root.
- HUD theme: dark palette tokens `hud.*` in `tailwind.config.ts`.

## Documentation map

- `docs/PLAN.md` — intended design and build order. Not a progress record.
- `docs/RULES.md` — the desktop application's character-generation rules, every claim cited to `Battletech-Character-Creator@a1d8009`.
- `CLAUDE.md` — commands, architecture, and conventions for this repository.
- `AGENTS.md` — directory-local context, one file per directory.
- Build status — answered by `git log` and GitHub issues, not by any document.
