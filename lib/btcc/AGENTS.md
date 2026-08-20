<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# btcc

## Purpose
The `.btcc` desktop file format — parser, serializer, and the type that defines it. The design goal
is a **byte-compatible round-trip**: a file saved by the C++/Qt desktop app must survive
`parse → serialize` unchanged, so files can move between the desktop app and this web app freely.
That constraint is why character data is stored as JSONB with field ordering preserved rather than
normalized into columns.

Format shape: newline-delimited `key:value` lines, followed by a verbatim `<notes>…</notes>` block.
Repeated keys carry different payloads: `skill:`/`trait:`/`preskill:`/`pretrait:` are `name=xp`,
`attr:`/`preattr:` are `key=int`, `equiploc:` is `key=string`, and `equip:`/`weapon:`/`chrweapon:`
are raw values that are never split on `=`.

## Key Files
| File | Description |
|------|-------------|
| `types.ts` | `BtccDraft`, `BtccRow`, `BtccScalars`, `SCALAR_KEYS`, `NUMERIC_SCALAR_KEYS`, `emptyDraft()`. The format contract. |
| `parse.ts` | `parseBtcc(text): BtccDraft`. Total function — never throws. |
| `serialize.ts` | `serializeBtcc(draft): string`. Byte-compatible emitter. |
| `index.ts` | Barrel — the intended import surface. |
| `test-fixtures.ts` | `readFixture(name)` + `FIXTURE_NAMES`; reads `__fixtures__/` verbatim as UTF-8. |
| `roundtrip.test.ts` | **The golden test** (9 cases). Asserts `parse → serialize` reproduces fixture bytes. |
| `parse.test.ts` | 13 cases covering tolerance and edge inputs. |
| `serialize.test.ts` | 6 cases covering emit order and formatting. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `__fixtures__/` | Three real `.btcc` files — `lisa.btcc` (fully populated), `newchar.btcc` (fresh character), `test.btcc`. Read via `test-fixtures.ts`; `lisa.btcc` is also the source for the DB seed and the import e2e spec. No AGENTS.md — covered here. |

## For AI Agents

### Working In This Directory

**`SCALAR_KEYS` is the single source of truth for field order.** It is declared
`as const satisfies readonly (keyof BtccScalars)[]`, which holds the 21 scalars in exact desktop emit
order. Reordering it changes output bytes and breaks desktop compatibility. Note the `satisfies`
clause only constrains each element to be *some* key of `BtccScalars` — it does **not** enforce
completeness, uniqueness, or order, so dropping or duplicating a key still compiles. There is no
exhaustiveness guard; the golden round-trip test is what actually catches such a mistake.

`NUMERIC_SCALAR_KEYS` (`age`, `height`, `weight`, `gmxpmod`, `cbillmod`) is the set treated as
integers. `gmxpmod` carries the wizard's derived XP residual, not a GM fudge factor —
`docs/RULES.md` §2.5.

**Provenance.** The ground truth is the desktop source `mainwindow.cpp`: `prepSaveFile`
(serialization) around lines 2285-2431, and `openFile` (parsing) around lines 2037-2259. Those
citations are in the file headers — keep them.

**`parse.ts` is deliberately total** — it never throws, and returns an `emptyDraft()` filled in from
whatever it recognized. Behaviors that are load-bearing:
- Input is normalized first: a leading BOM is stripped and `\r\n` / lone `\r` collapse to `\n`.
- The notes block is carved off *before* line processing, and its body is captured as the exact
  substring between the opening `<notes>\n` and the **last** `\n</notes>`. This differs from the
  desktop's line-by-line re-append and is precisely what makes byte-exact reproduction possible.
  An unterminated block takes everything after the opener.
- `toInt()` mirrors Qt's `QString::toInt()`: empty or non-numeric becomes `0`, never `NaN`.
- `name=xp` rows split on the **first** `=`, so names containing `=` survive.
- Unknown keys are ignored, matching the desktop loader's forward compatibility.

Because it never rejects input, parsing alone cannot tell you whether a file *is* a character —
that is what `looksLikeCharacter` in `lib/characters/import.ts` is for.

**`serialize.ts` emit order** (deviating from this changes bytes):
1. All 21 scalars, always emitted even when empty
2. `attr` — ASCII/code-point sorted, matching Qt `QMap` key ordering
3. `skill` → 4. `trait` — insertion order
5. `equip` — raw `;`-joined strings, verbatim
6. `preattr` — sorted, **positive values only** (matches the desktop's `> 0`)
7. `preskill` → 8. `pretrait` — insertion order
9. `equiploc` — sorted, **non-empty values only**
10. `weapon` (raw) → 11. `chrweapon`
12. `<notes>` block with the verbatim body

Output is **UTF-8, LF line endings, no BOM, single trailing newline**. Sorting uses a plain
code-point comparison (`asciiSort`), *not* `localeCompare` — locale-aware collation would reorder
keys and break fidelity.

### Testing Requirements
- `npm run test -- lib/btcc/` runs all three test files (28 cases). Node environment; no pragma.
- `roundtrip.test.ts` is a fidelity guard, not a style test. If it fails, assume the change broke
  desktop compatibility and fix the code — do not relax the assertion.
- **Line endings matter for these tests.** The serializer always writes LF, and the golden test
  compares its output against the fixture bytes as read from disk. If git checks the fixtures out
  with CRLF (`core.autocrlf=true` on Windows), the round-trip tests fail even though the code is
  correct. This is a **local environment artifact, not a regression** — confirm by stashing your
  changes and re-running. A `.gitattributes` entry forcing `-text`/LF on `*.btcc` would fix it
  permanently.
- When adding a fixture, add its name to `FIXTURE_NAMES` so the round-trip test picks it up.

### Common Patterns
- Read tolerant, write strict: parsing accepts anything, serializing always produces canonical form.
- Sections the editor never touches (`equip`, `weapons`, `pre*`) are carried verbatim rather than
  interpreted, which is what keeps fidelity cheap.

## Dependencies

### Internal
None. This module is the base of `lib/` and imports nothing else from it — keep it that way.
(`test-fixtures.ts` uses `node:fs`, so it is test/script-only and must not be imported by app code.)

### External
Node built-ins only, and only in `test-fixtures.ts`. The parser and serializer are pure string code
with no dependencies.

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
