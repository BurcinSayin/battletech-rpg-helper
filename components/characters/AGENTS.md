<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# characters

## Purpose
The HUD-themed component kit for the character editor, sheet, and import preview. This is the
largest component group and the only one using the dark `hud.*` palette. It renders character data
but computes nothing — XP math, catalog checks, and mapping all come from `lib/characters`.

## Key Files
| File | Description |
|------|-------------|
| `ui.tsx` | Shared primitives: `Panel`, `HudButton`, `Stepper`, and the `hudInput` class string. |
| `character-sheet.tsx` | Read-only character sheet with a swappable header action slot. |
| `conflict-dialog.tsx` | Modal shown when a save hits `PT409`. |
| `remote-change-banner.tsx` | Non-modal `role="status"` notice that the character changed elsewhere, with Reload / Dismiss. Deliberately *not* `conflict-dialog.tsx`: realtime is an early warning, `PT409` remains the backstop. |
| `warnings.tsx` | `CatalogWarningBanner` — non-blocking notice for off-catalog names. |
| `ui.test.tsx` | 7 cases. |
| `character-sheet.test.tsx` | 5 cases. |
| `warnings.test.tsx` | 3 cases. |

## For AI Agents

### Working In This Directory

**Reach for `ui.tsx` before writing anything new.** `Panel` renders the section header style with an
optional count and action slot, `HudButton` is the button, `Stepper` is the numeric increment
control, and `hudInput` is the shared input class string (the analogue of `fieldClass` in
`components/auth/`). Duplicating these is the most likely way to make this directory inconsistent.

**`CharacterSheet` is shared by two callers with different needs.** Its header action defaults to an
Edit button driven by `onEdit`, but callers can pass an `actions` node to replace it entirely — the
editor passes Edit, the import preview passes Import/Cancel. Preserve that seam rather than adding a
mode flag. It mirrors section 02 of `docs/design/BattleTech-Wireframes.html`, and shows the top 5
skills (`TOP_SKILLS`) rather than all of them.

**`ConflictDialog` is deliberately non-destructive.** It offers reload-or-keep-editing and nothing
else; there is no field-level merge in the MVP, per the Concurrency UX section of `docs/PLAN.md`.
It is a plain dialog with `role`, `aria-modal`, and `aria-labelledby` set — keep those if you
restyle it.

**Catalog warnings must stay non-blocking.** `CatalogWarningBanner` reports names absent from the
static rules catalog. `.btcc` files carry version-drifted names (backticks, plural "Interests",
"MedTech"), so these are kept verbatim for desktop round-trip — warned, never rejected. Do not turn
this into an error state or a save blocker. `import-client.tsx` has its own richer `NotInCatalog`
variant that splits skills from traits; both convey the same "kept as-is" message.

**Styling.** Use the `hud.*` Tailwind tokens defined in `tailwind.config.ts` (`hud-bg`, `hud-panel`,
`hud-raised`, `hud-line`, `hud-text`, `hud-muted`, `hud-amber`, `hud-green`, `hud-red`). Do not mix in the `foreground/*`
tokens used by the auth screens.

`character-sheet.tsx` is a client component because it holds local expand/collapse state;
`conflict-dialog.tsx`, `warnings.tsx`, and `ui.tsx` are server components. Do not add the directive
without a reason.

### Testing Requirements
- **Every test file here needs the jsdom environment pragma on its first lines** — the Vitest
  default is `node` and these render DOM.
- Run the group with `npm run test -- components/characters/`.
- Tests use `@testing-library/react` and query by role/text, so keep accessible names stable when
  restyling.
- `.tsx` test files are excluded from coverage reporting by `vitest.config.ts`.

### Common Patterns
- Props are declared inline in the signature; components take `className` and merge it last via
  `cn()`.
- Components return `null` when there is nothing to show (see `CatalogWarningBanner` with zero
  warnings) rather than rendering an empty container.
- Section headers use a `// NAME` convention echoing the wireframe's terminal aesthetic.

## Dependencies

### Internal
- `lib/utils.ts` — `cn()`
- `lib/characters` — `ATTRIBUTE_KEYS`, and the `CatalogWarnings` / `XpSummary` types
- `lib/btcc/types.ts` — `BtccDraft`
- `tailwind.config.ts` — the `hud.*` palette

### External
- `react` 19; `@testing-library/react` + `jsdom` for tests

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
