<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# docs

## Purpose
Design and planning documents. `PLAN.md` is the project's authoritative record of build order and
design rationale — consult it before adding a feature, and trust it over the README.

## Key Files
| File | Description |
|------|-------------|
| `PLAN.md` | 150 lines. The **source of truth for build-order status** and the reasoning behind the riskiest decisions. |
| `design/BattleTech-Wireframes.html` | ~360 KB self-contained static wireframe reference for the HUD UI. |

## For AI Agents

### Working In This Directory
- **`PLAN.md` outranks the README.** The README contains aspirational marketing language describing
  features that do not exist yet; `PLAN.md` and the code are accurate. Its sections are: Context,
  Grounding facts (verified from source), Architecture, Postgres schema, RLS policies, Rules data
  ingestion, Character editor, `.btcc` import/export, Project structure, Key libraries, Build order,
  Critical files to create, Verification, and Riskiest decisions to watch.
- Current status per that build order: **steps 1-6 are complete** (bootstrap, auth, schema/RLS/RPCs,
  rules ingestion, character CRUD + editor, `.btcc` import/export round-trip). **Steps 7-9 are
  pending**: campaigns + GM edit + realtime, PWA/offline via Serwist, and Vercel deploy + polish.
  The clearest in-code marker of this is `app/(app)/campaigns/[id]/page.tsx`, a nine-line TODO stub.
- If you complete a build step, update `PLAN.md` in the same change. A stale plan is worse than none,
  because everything else defers to it.
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
