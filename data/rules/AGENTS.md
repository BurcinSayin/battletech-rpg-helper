<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# rules

## Purpose
The *A Time of War* rules catalogs as typed JSON. **Every file here is generated** by
`npm run rules:ingest` from the desktop app's `resource/*.dat` tables. They are committed so the app
builds and runs without the desktop checkout, and so the catalog is available offline.

## Key Files
| File | Shape | Notes |
|------|-------|-------|
| `skills.json` | `{ name, attributes, cost, category }[]` | Largest catalog (~10 KB). `attributes` is a code like `RFL`. `cost` is the skill's **Target Number**, not an XP cost — `allskills.dat` is `Name;LINK,TN/CAT` (`scripts/convert-dat.ts:57-69`). `category` (`SB`/`CB`/`SA`/`CA`) has **no pricing effect**. Rename is step 10. `docs/RULES.md` §2.3. |
| `traits.json` | `{ name, page }[]` | `page` is the rulebook reference. |
| `subskills.json` | `Record<string, string[]>` | Parent skill to ordered sub-skill names; expanded into composite `"Parent/Sub"` names. |
| `affiliations.json` | `string[]` | |
| `careers.json` | `string[]` | Generated from the singular `career.dat`. |
| `eyeColors.json` | `string[]` | |
| `hairColors.json` | `string[]` | |
| `phenotypes.json` | `string[]` | |
| `planets.json` | `string[]` | |

## For AI Agents

### Working In This Directory

**Never hand-edit these files.** The next `npm run rules:ingest` overwrites them. To change the data,
change `scripts/convert-dat.ts` or the upstream `.dat` source, then regenerate.

**Do not reach for these JSON files directly from app code.** Import from `lib/rules/load.ts`, which
provides the typed accessors and derived helpers such as `compositeSkillNames()`. Consuming the raw
JSON bypasses the type annotations that turn a shape drift into a compile error.

They are **statically imported**, so the data is bundled at build time — no fetch, no database, no
loading state. That is deliberate; do not convert it to a runtime fetch.

`data/rules/**` is **lint-ignored** in `eslint.config.mjs`, so lint failures will never flag problems
here. The real guard is `lib/rules/catalog.test.ts`, which validates every catalog against the Zod
schemas in `lib/validation/catalog.ts`.

The `.gitkeep` is a leftover from before the data was generated; it is harmless.

**Skill and trait names in real `.btcc` files do not always match this catalog.** Names drift between
rulebook versions (backticks, plural "Interests", "MedTech"), so the app treats an unrecognized name
as a *warning*, never a rejection. Do not "fix" a `.btcc` file to match this data, and do not treat
this catalog as a validation whitelist.

### Testing Requirements
- After any regeneration: `npm run test -- lib/rules/catalog.test.ts`, then review `git diff` to
  confirm the change is intentional and scoped.

### Common Patterns
- All files are 2-space-indented JSON arrays or objects, sorted as the source `.dat` ordered them.

## Dependencies

### Internal
- Produced by `scripts/convert-dat.ts`
- Consumed by `lib/rules/load.ts`; validated by `lib/validation/catalog.ts`

### External
- The desktop `Battletech-Character-Creator/resource` checkout — needed only to regenerate

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
