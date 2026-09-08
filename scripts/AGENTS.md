<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# scripts

## Purpose
Three `tsx`-executed generators. All write **committed** artifacts, so running them produces a diff
that must be reviewed and checked in — they are not throwaway tooling.

## Key Files
| File | Description |
|------|-------------|
| `convert-dat.ts` | `npm run rules:ingest` — converts the desktop app's `resource/*.dat` tables into the typed JSON under `data/rules/`. |
| `extract-rules.ts` | `npm run rules:extract` — parses the desktop app's C++ sources into `data/rules/modules.json` (lifepath modules + gating + the Stage 0 catalog). Parsing core lives in `extract-rules-lib.ts`, the Stage 0 contract extraction in `extract-stage0.ts`. |
| `generate-seed.ts` | `npm run seed:generate` — regenerates `supabase/seed.sql` from the `lisa.btcc` fixture. |

## For AI Agents

### Working In This Directory

**`convert-dat.ts`** reads from a *separate, read-only* checkout of the C++ desktop app. It
defaults to the sibling path `../Battletech-Character-Creator/resource` and can be pointed
elsewhere with the `BTCC_SOURCE_DIR` environment variable. Without that checkout the script cannot
run — but `data/rules/*.json` is committed, so the app builds fine without it. Only re-run when the
upstream rules data actually changes.

- The catalog `.dat` files are ASCII, read as `latin1`. `allskills.dat` is `name;ATTRS,TN/category`,
  `alltraits.dat` is `name;pageref`, and `subskill.dat` is `parent;sub`; the remaining catalogs are
  plain one-value-per-line lists. Parsing provenance is `loadresurce.cpp` and `stage1_resurce.cpp`
  (`CreateSubSkillList` is what builds composite `"parent/sub"` names).
- In `allskills.dat` the numeric field is the **Target Number**, not an XP cost, so the generator
  emits it as `targetNumber` — `docs/RULES.md` §2.3.
- **Upstream filenames contain typos — preserve them.** The affiliations source is
  `affilations.dat` (missing the second `i`), and `career.dat` is singular while the output is
  `careers.json`. Do not "fix" these read paths.
- `skillsdesc.dat` / `traitsdesc.dat` are **intentionally deferred**: they are Windows-1251 encoded
  and would require `iconv-lite`, and they only feed lazy detail panels. Leave them out.
- Emits nine files: `skills`, `traits`, `subskills`, `affiliations`, `careers`, `eyeColors`,
  `hairColors`, `phenotypes`, `planets`.

**`extract-rules.ts`** (build step #11, `docs/PLAN.md`) also reads the desktop checkout, but parses
imperative C++ instead of `.dat` tables: the four stage files `stage1_resurce.cpp` …
`stage4_resurce.cpp` live in the checkout **root** (one level above `resource/`), and
`resource/affilations.dat` supplies the affiliation-index → name join. Output is
`data/rules/modules.json`: lifepath `modules` plus a separate `gating` array, with availability
resolved to affiliation names.

- Ground truth is `docs/RULES.md` §6.1 (gating), §7.4 (module anatomy) and §8 (Table M/G counts);
  the generator cross-checks its own block counts against those numbers and throws on drift.
- The statement parser is a **strict allowlist**: any unrecognized live C++ statement inside a
  parsed block throws. That is deliberate — desktop changes must fail loudly, never silently drop
  data. Extend the allowlist in `extract-rules-lib.ts` when upstream changes.
- Output is deterministic; re-running must be byte-identical (a test asserts it).
- Stage 0 is extracted too: `extractStage0` (`scripts/extract-stage0.ts`, contract in
  `lib/rules/stage0-contract.ts`) reads the affiliation functions of `text_resurce.cpp`
  (`rSubAff`, `subAffAttr`, `clanCaste`, `comstarAttr`, `comstarSub`, `WoBSub`) with `wizard.cpp`
  and `s0moredialog.cpp` supplying labels and candidate kinds, and emits the separate top-level
  `stage0` catalog. It stays out of the §8 Table M/G accounting; see the `meta.notes` entries.
- The desktop checkout must sit at the pinned revision `a1d8009` — the `docs/RULES.md` citations
  and the §8 counts assume it.

**`generate-seed.ts`** deliberately routes the fixture through the *application's own* code path —
`parseBtcc` → `draftToColumns` — rather than hand-writing SQL. That is what keeps the seed
byte-faithful to `lisa.btcc`; keep it that way, and never hand-edit `supabase/seed.sql`.

- Uses fixed UUIDs for the user and character so resets are deterministic.
- Values are dollar-quoted so JSON and notes need no escaping.
- **This script embeds a hard-coded email, password, and display name for the local dev user.**
  That is local-convenience only, as the generated file's own header states. Never run it against,
  or point the resulting SQL at, a real project — and do not copy this pattern into anything that
  touches a deployed database.

### Testing Requirements
- `convert-dat.ts` and `generate-seed.ts` have no unit tests; they are verified by their output.
  `extract-rules.ts` has a vitest suite (`scripts/extract-rules.test.ts`, 46 cases) that reads the
  §8 counts from `docs/RULES.md`, pins the §7.4 worked example, determinism, availability
  semantics, and the Stage 0 contract — it needs the desktop checkout, like the generators themselves.
- After `npm run rules:ingest`: run `npm run test -- lib/rules/catalog.test.ts`, which validates the
  regenerated JSON against the Zod schemas in `lib/validation/catalog.ts`, then review `git diff`.
- After `npm run rules:extract`: run `npm run test -- scripts/extract-rules.test.ts` and review
  `git diff` (output must be byte-identical unless the desktop source changed).
- After `npm run seed:generate`: run `npx supabase db reset` and confirm the stack comes up with the
  seeded character present.

### Common Patterns
- All three resolve paths from `import.meta.url` via `fileURLToPath`, so they work regardless of cwd.
- Only `generate-seed.ts` prepends a `-- GENERATED …` / do-not-edit-by-hand banner (to its SQL
  output). The JSON catalogs under `data/rules/` are bannerless — their provenance lives in the
  generating scripts and in the AGENTS.md docs. Do not add banners to the JSON outputs.

## Dependencies

### Internal
- `lib/btcc` (`parseBtcc`), `lib/btcc/test-fixtures` (`readFixture`), `lib/characters/mapping`
  (`draftToColumns`) — imported by `generate-seed.ts` via relative paths, not the `@/` alias

### External
- `tsx` — the runner (devDependency)
- Node built-ins only (`node:fs`, `node:path`, `node:url`, `node:child_process`); no third-party parsing libraries
- An external checkout of `Battletech-Character-Creator` for `convert-dat.ts` and `extract-rules.ts`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
