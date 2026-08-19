<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# components

## Purpose
Presentational React components, grouped by the area of the app they serve. Components here hold
layout and interaction concerns only — domain logic (XP math, mapping, validation) lives in
`lib/` and is imported, never reimplemented.

Note that two visual languages coexist deliberately: the character editor uses the dark HUD
palette (`hud.*` tokens from `tailwind.config.ts`), while the auth screens use the neutral
`foreground/*` tokens. Match whichever group you are working in rather than unifying them.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `characters/` | HUD-themed editor kit: panels, steppers, sheet, conflict dialog, warnings (see `characters/AGENTS.md`) |
| `auth/` | Login and signup forms plus a shared field wrapper (see `auth/AGENTS.md`) |
| `layout/` | App shell header and the single page-width primitive (see `layout/AGENTS.md`) |
| `ui/` | Contains only `.gitkeep`. The shadcn/ui output directory configured by `components.json` — currently unused; no components have been generated into it. |
| `app-shell/` | Empty placeholder — planned, no files yet. |

## For AI Agents

### Working In This Directory
- Check `characters/ui.tsx` before writing a new primitive; `Panel`, `HudButton`, `Stepper`, and
  the `hudInput` class string already cover most editor needs.
- Server Components are the default here too. `character-sheet.tsx`, the two auth forms, and
  anything using hooks are `"use client"`; `conflict-dialog.tsx`, `warnings.tsx`, `field.tsx`,
  `page-container.tsx`, and `app-header.tsx` are not — do not add the directive unless a
  component actually needs client-side state.
- Compose class names with `cn()` from `lib/utils.ts` (clsx + tailwind-merge) so conflicting
  Tailwind utilities resolve predictably.

### Testing Requirements
- Component tests are colocated `*.test.tsx` files using `@testing-library/react`, and **each one
  needs `// @vitest-environment jsdom`** at the top — the project default is `node`.
- Only `characters/` currently has tests (`character-sheet`, `ui`, `warnings`).
- Vitest picks up `components/**/*.test.tsx`; `.tsx` test files are excluded from coverage.

### Common Patterns
- Props are declared inline in the function signature rather than as separate exported interfaces.
- Prettier runs `prettier-plugin-tailwindcss`; leave class ordering to it.
- Components accept a `className` prop and merge it last so callers can override.

## Dependencies

### Internal
- `lib/utils.ts` — `cn()`
- `lib/characters/` — `CatalogWarnings`, `XpSummary`, `ATTRIBUTE_KEYS` types and constants
- `lib/btcc/types.ts` — `BtccDraft` for the sheet
- `app/(auth)/actions.ts` — `signIn`/`signUp`/`signOut` invoked by forms and the header

### External
- `react` 19, `react-hook-form` + `@hookform/resolvers`, `zod`
- `clsx`, `tailwind-merge`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
