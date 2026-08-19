<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# characters

## Purpose
The character domain layer: it translates between the `.btcc` draft model and the database row,
defines the editable form and its validation, computes XP the way the desktop app does, classifies
the RPC's custom error codes, and guards `.btcc` import. This is the module that makes lossless
round-tripping survive a trip through Postgres.

## Key Files
| File | Description |
|------|-------------|
| `types.ts` | `CharacterRow`, `CharacterColumns`, `CharacterInfo`, `PreSnapshot` — the JSONB column contract. |
| `mapping.ts` | `rowToDraft`, `draftToColumns`, `draftToPayload`, `draftToInsert`. |
| `schema.ts` | Zod form schema, `draftToForm` / `formToDraft`, catalog warning helpers. |
| `xp.ts` | `computeXp`, `attributeXp`, `sumRows`, `ATTRIBUTE_KEYS`, `ATTRIBUTE_BASE`, `CHARACTER_START_XP`. |
| `errors.ts` | `classifyUpdateError` — maps `PT409`/`PT403` to a union. |
| `import.ts` | `prepareImport`, `looksLikeCharacter`, `normalizeImportName`. |
| `index.ts` | Barrel — **import from `@/lib/characters`**, not the individual files. |

## For AI Agents

### Working In This Directory

**The column contract** (defined by `supabase/migrations/20260629150000_init.sql:47-50` and mirrored
in `types.ts`):

| Column | Holds |
|--------|-------|
| `name`, `notes` | plain columns |
| `info` (JSONB) | `scalars` **plus** `equip`, `equipLoc`, `weapons`, `chrWeapons` — verbatim |
| `attributes` (JSONB) | the draft's `attrs` |
| `skills`, `traits` (JSONB) | `BtccRow[]` |
| `pre_snapshot` (JSONB) | `preAttrs`, `preSkills`, `preTraits` |

The equip/weapons/`pre*` sections ride along untouched even though the MVP editor never edits them.
That is the whole reason a `.btcc` file survives a database round-trip.

**`mapping.ts` — read tolerant, write strict.** `rowToDraft` defends against malformed JSONB
(`asObject`/`asRows`/`asNumberRecord` coerce bad shapes to empty rather than throwing), because rows
could predate a schema change. The write helpers always emit well-formed shapes.

Two non-obvious details in the write path:
- **`draftToPayload` intentionally omits `campaign_id`.** The `update_character` RPC distinguishes
  "key absent" (leave campaign as-is) from "explicit null" (detach), so omitting the key is what
  makes a normal save leave campaign membership alone. Do not add it to the payload to be "complete".
- `owner_id` and `version` are never client-writable — the RPC whitelists columns and bumps `version`
  itself.

**`schema.ts` — the merge is the safety mechanism.** `formToDraft(base, values)` spreads `...base`
first and overlays only the five editable groups, so every untouched section is preserved by
construction. `attrs` is **merged** (`{...base.attrs, ...values.attributes}`), not replaced, so
attributes outside the standard eight survive. Combined with the server-side re-fetch in
`saveCharacter`, this is what prevents the editor from silently dropping data it cannot display.

There is also a compile-time guard — `const _toScalars = (v) => v` typed against `BtccScalars` —
that fails the build if the form schema and the `.btcc` scalar model drift apart. Keep it.

**Catalog checks warn, they never fail.** `catalogWarnings` returns unknown skill/trait names for
display only. `.btcc` names are version-drifted from the current rules data (backticks, plural
"Interests", "MedTech"), so rejecting them would make real files unimportable. Never promote these
warnings to validation errors. The name sets are lazily memoized in module-level caches, so calling
the helpers repeatedly is cheap; `catalogSkillNames`/`catalogTraitNames` return sorted lists for the
editor's `<datalist>` autocomplete.

**`xp.ts` mirrors the desktop, including its quirks.** Eight attributes; each starts at
`ATTRIBUTE_BASE = 100` for free and only increases above that cost XP; the budget is
`CHARACTER_START_XP = 5000`; negative skill/trait XP **refunds** into the pool (e.g.
`trait:Unlucky=-50`). `gmxpmod` is persisted but **display-only** — it is deliberately not folded
into the budget, because the desktop math ignores it. Provenance is cited in the header
(`s2flexxpdialog.cpp:106-109`, `chardata.cpp:7`, `chardata.cpp:13-20`).

**`errors.ts`** checks the code on `PostgrestError.code` and *also* falls back to substring-matching
the message, defensively, in case a transport only carries it there. `PT409` → `"conflict"` (show
`ConflictDialog`), `PT403` → `"forbidden"`.

**`import.ts`** exists because `parseBtcc` never rejects anything. `looksLikeCharacter` requires a
non-blank name or at least one attr/skill/trait; `normalizeImportName` trims, falls back to
`"Imported Character"`, and clamps to `NAME_MAX_LENGTH = 100` to satisfy the DB check constraint
`char_length(name) between 1 and 100`.

### Testing Requirements
- Five colocated `*.test.ts` files, node environment, 28 cases:
  `npm run test -- lib/characters/`.
- When changing the column contract, update `mapping.test.ts` **and** verify the `.btcc` golden test
  still passes (`npm run test -- lib/btcc/roundtrip.test.ts`) — the two are coupled through the
  draft model.
- Changing the schema shape also affects `scripts/generate-seed.ts`, which calls `draftToColumns`.

### Common Patterns
- Every exported symbol is re-exported from `index.ts`; add new ones there too.
- Helpers never mutate their inputs — `prepareImport` and `formToDraft` both return new objects.
- Zod numeric fields use `z.coerce.number()` because they arrive as strings from form inputs.

## Dependencies

### Internal
- `lib/btcc/types.ts` — `BtccDraft`, `BtccRow`, `BtccScalars`, `SCALAR_KEYS`, `emptyDraft`
- `lib/rules/load.ts` — skill/trait catalogs for warning checks
- `lib/supabase/database.types.ts` — `Database`, `Json`, and the row/insert types

### External
- `zod`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
