<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# validation

## Purpose
Zod schemas describing the shape of the generated rules JSON in `data/rules/`. These are the
authority on what a well-formed catalog looks like, and the source of the `Skill`/`Trait`/`Subskills`
types used throughout the app.

## Key Files
| File | Description |
|------|-------------|
| `catalog.ts` | `skillSchema`, `traitSchema`, `skillsSchema`, `traitsSchema`, `subskillsSchema`, `stringListSchema`, and the three inferred types. |

## For AI Agents

### Working In This Directory
- Shapes: a skill is `{ name, attributes, targetNumber: int, category }`; a trait is `{ name, page }`;
  `subskills.json` is a record of parent skill → ordered sub-skill names; every other catalog
  (affiliations, careers, colors, phenotypes, planets) is a plain non-empty string list.
- `targetNumber` is the skill's **Target Number**, never an XP price — `docs/RULES.md` §2.3. Do not
  use it in XP arithmetic.
- **Types flow outward from here.** `Skill`, `Trait`, and `Subskills` are inferred from the schemas
  and re-exported by `lib/rules/types.ts`, which is what most code imports. Change a schema and the
  type changes everywhere — that is the intent.
- These schemas validate *generated* data, so a failure means `scripts/convert-dat.ts` or its
  upstream `.dat` source changed shape, not that a user typed something wrong. Fix the generator.
- Despite the directory name, this is **not** where character/form validation lives — that is
  `lib/characters/schema.ts` (character form) and `lib/auth/schema.ts` (credentials). This module is
  only about the rules catalog.

### Testing Requirements
- Exercised by `lib/rules/catalog.test.ts` rather than a colocated test file; there is no
  `validation/*.test.ts`. Run `npm run test -- lib/rules/catalog.test.ts` after changing a schema.

### Common Patterns
- String fields use `.min(1)` so empty values fail loudly instead of silently producing blank
  dropdown entries.
- Schemas and their inferred types are exported together from the same file.

## Dependencies

### Internal
None — this is a leaf module. It is imported by `lib/rules/`, and must not import from it (that
would create a cycle).

### External
- `zod`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
