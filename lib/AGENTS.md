<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# lib

## Purpose
The domain core, and the highest-value directory in the repo. Everything that makes this project
more than a CRUD app lives here: the byte-compatible `.btcc` file format, the lossless mapping
between that format and the database row shape, the XP rules ported from the desktop app, and the
Supabase client factories. Route handlers and components stay thin by delegating here.

## Key Files
| File | Description |
|------|-------------|
| `utils.ts` | `cn()` — the single class-name helper (clsx + tailwind-merge). |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `btcc/` | The `.btcc` desktop file format: types, parser, serializer, golden round-trip tests (see `btcc/AGENTS.md`) |
| `characters/` | Row ↔ draft mapping, form schema, XP math, error classification, import guard (see `characters/AGENTS.md`) |
| `supabase/` | Browser / server / middleware client factories and generated DB types (see `supabase/AGENTS.md`) |
| `rules/` | Typed accessors over the static rules catalogs in `data/rules/` (see `rules/AGENTS.md`) |
| `validation/` | Zod schemas describing the shape of the generated rules JSON (see `validation/AGENTS.md`) |
| `auth/` | Sign-in / sign-up Zod schemas (see `auth/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **Import through the barrels.** `btcc/index.ts` and `characters/index.ts` are the intended public
  surface; prefer `from "@/lib/characters"` over reaching into `characters/mapping.ts`. The one
  routine exception is type-only imports of `BtccDraft` from `@/lib/btcc/types`.
- The dependency direction is acyclic. Keep it that way:

  ```
  validation/  <-  rules/  <-  characters/  ->  btcc/
                                    |
                                    +->  supabase/database.types (type-only)
  ```

  `btcc/` depends on nothing else in `lib/`. `validation/` depends only on zod. Do not make
  `btcc/` import from `characters/`.
- These modules are the shared vocabulary for both the browser and the server, so keep them free of
  `next/headers`, `window`, and other environment-specific imports — `supabase/` is the deliberate
  exception that isolates that concern.
- The header comments in these files cite specific desktop-app source locations (for example
  `mainwindow.cpp` `prepSaveFile` ~2285-2431, `chardata.cpp:7`). They are the provenance for
  non-obvious constants. Preserve them when editing.

### Testing Requirements
- Unit tests are colocated `*.test.ts` files and run in the `node` environment — no pragma needed.
- `npm run test -- lib/characters/xp.test.ts` runs a single file; `npm run test` runs all 14 unit
  test files (88 cases across `lib/`, `app/`, and `components/`).
- `lib/btcc/roundtrip.test.ts` is a **golden test**: it asserts `parse → serialize` reproduces the
  fixture byte-for-byte. Treat a failure there as a fidelity regression, not a test to relax.

### Common Patterns
- Zod schemas are colocated with the domain they validate and export inferred types alongside.
- Read paths are tolerant of malformed input; write paths always emit well-formed shapes.
- Constants ported from the desktop app carry a comment naming the C++ file they came from.

## Dependencies

### Internal
- `data/rules/*.json` — statically imported by `rules/load.ts`
- `lib/supabase/database.types.ts` — generated; the source of `CharacterRow`

### External
- `zod` — all validation
- `@supabase/ssr`, `@supabase/supabase-js` — client factories
- `clsx`, `tailwind-merge` — `utils.ts` only

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
