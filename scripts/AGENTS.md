<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# scripts

## Purpose
Two `tsx`-executed generators. Both write **committed** artifacts, so running them produces a diff
that must be reviewed and checked in — they are not throwaway tooling.

## Key Files
| File | Description |
|------|-------------|
| `convert-dat.ts` | `npm run rules:ingest` — converts the desktop app's `resource/*.dat` tables into the typed JSON under `data/rules/`. |
| `generate-seed.ts` | `npm run seed:generate` — regenerates `supabase/seed.sql` from the `lisa.btcc` fixture. |

## For AI Agents

### Working In This Directory

**`convert-dat.ts`** reads from a *separate, read-only* checkout of the C++ desktop app. It
defaults to the sibling path `../Battletech-Character-Creator/resource` and can be pointed
elsewhere with the `BTCC_SOURCE_DIR` environment variable. Without that checkout the script cannot
run — but `data/rules/*.json` is committed, so the app builds fine without it. Only re-run when the
upstream rules data actually changes.

- The catalog `.dat` files are ASCII, read as `latin1`. `allskills.dat` is `name;ATTRS,cost/category`,
  `alltraits.dat` is `name;pageref`, and `subskill.dat` is `parent;sub`; the remaining catalogs are
  plain one-value-per-line lists. Parsing provenance is `loadresurce.cpp` and `stage1_resurce.cpp`
  (`CreateSubSkillList` is what builds composite `"parent/sub"` names).
- In `allskills.dat` the `cost` field is the **Target Number**, not an XP cost —
  `docs/RULES.md` §2.3; rename in step 10.
- **Upstream filenames contain typos — preserve them.** The affiliations source is
  `affilations.dat` (missing the second `i`), and `career.dat` is singular while the output is
  `careers.json`. Do not "fix" these read paths.
- `skillsdesc.dat` / `traitsdesc.dat` are **intentionally deferred**: they are Windows-1251 encoded
  and would require `iconv-lite`, and they only feed lazy detail panels. Leave them out.
- Emits nine files: `skills`, `traits`, `subskills`, `affiliations`, `careers`, `eyeColors`,
  `hairColors`, `phenotypes`, `planets`.

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
- Neither script has unit tests; they are verified by their output.
- After `npm run rules:ingest`: run `npm run test -- lib/rules/catalog.test.ts`, which validates the
  regenerated JSON against the Zod schemas in `lib/validation/catalog.ts`, then review `git diff`.
- After `npm run seed:generate`: run `npx supabase db reset` and confirm the stack comes up with the
  seeded character present.

### Common Patterns
- Both resolve paths from `import.meta.url` via `fileURLToPath`, so they work regardless of cwd.
- Both prepend a `-- GENERATED …` / do-not-edit-by-hand banner to their output.

## Dependencies

### Internal
- `lib/btcc` (`parseBtcc`), `lib/btcc/test-fixtures` (`readFixture`), `lib/characters/mapping`
  (`draftToColumns`) — imported by `generate-seed.ts` via relative paths, not the `@/` alias

### External
- `tsx` — the runner (devDependency)
- Node built-ins only (`node:fs`, `node:path`, `node:url`); no third-party parsing libraries
- An external checkout of `Battletech-Character-Creator` for `convert-dat.ts`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
