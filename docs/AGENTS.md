<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# docs

## Purpose
Design and planning documents. `PLAN.md` is the intended design and build order, not a progress
record — consult it before adding a feature, and trust it over the README.

## Key Files
| File | Description |
|------|-------------|
| `PLAN.md` | Intended design and build order, plus the reasoning behind the riskiest decisions. Not a progress record. |
| `RULES.md` | The desktop application's character-generation rules, every claim cited to `Battletech-Character-Creator@a1d8009`. |
| `design/BattleTech-Wireframes.html` | ~360 KB self-contained static wireframe reference for the HUD UI. |

## Documentation Map
- `docs/PLAN.md` — intended design and build order. Not a progress record.
- `docs/RULES.md` — the desktop application's character-generation rules, every claim cited to `Battletech-Character-Creator@a1d8009`.
- `CLAUDE.md` — commands, architecture, and conventions for this repository.
- `AGENTS.md` — directory-local context, one file per directory.
- Build status — answered by `git log` and GitHub issues, not by any document.

## For AI Agents

### Working In This Directory
- **`PLAN.md` outranks the README.** `README.md` is marketing copy; `docs/PLAN.md` and the code
  describe the system. Its sections are: Context, Grounding facts (verified from source),
  Architecture, Postgres schema, RLS policies, Rules data ingestion, Character editor, `.btcc`
  import/export, Project structure, Key libraries, Build order, Known rules defects, Critical
  files to create, Verification, and Riskiest decisions to watch.
- `PLAN.md` records intended design and order, not progress. Do not add status marks to it;
  build status is answered by `git log` and GitHub issues.
- `design/BattleTech-Wireframes.html` is a **reference artifact, not a build input** — nothing
  imports it and no build step reads it. `components/characters/character-sheet.tsx` mirrors its
  section 02. Open it in a browser to check intended layout before redesigning editor UI. It gets no
  AGENTS.md of its own; it is covered here.

### Testing Requirements
None — this directory contains no executable code. The wireframe HTML is not linted, typechecked, or
served.

### Common Patterns
- `PLAN.md` cites desktop-app source files and line numbers as evidence for ported constants. The
  same convention appears in code comments throughout `lib/`.

## Dependencies

### Internal
Referenced *by* `README.md`, `CLAUDE.md`, the root `AGENTS.md`, and numerous code comments that cite
`PLAN.md` step numbers (for example the `TODO(step #7)` in the campaigns stub).

### External
None.

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
