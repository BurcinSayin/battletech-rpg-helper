<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# layout

## Purpose
App-shell chrome: the authed header, and the single primitive that controls page width everywhere.

## Key Files
| File | Description |
|------|-------------|
| `page-container.tsx` | `PageContainer` — centers content and applies a responsive max-width by tier. |
| `app-header.tsx` | `AppHeader` — top bar for the authed shell: home link, current email, sign-out form. |

## For AI Agents

### Working In This Directory

**`PageContainer` is the single knob for page width.** Set width by choosing a tier, not by adding
`max-w-*` classes at call sites — that drift is exactly what this component exists to prevent. The
`widths` map is mobile-first, each tier starting narrow and growing at larger breakpoints:

| Tier | Classes | Used for |
|------|---------|----------|
| `narrow` | `max-w-sm` | auth forms — stays narrow at every size |
| `content` | `max-w-2xl lg:max-w-5xl` | editor, character detail, landing (the default) |
| `wide` | `max-w-2xl md:max-w-4xl xl:max-w-6xl` | dashboards and card grids |

If a page needs a width none of these provide, add a tier here rather than overriding locally.

`AppHeader` is rendered once by `app/(app)/layout.tsx` and receives the already-fetched `email` as a
prop — it does no data fetching of its own, and should not start. Sign-out is a plain form posting to
the `signOut` action, so it works without client JavaScript; the email is hidden below the `sm`
breakpoint.

Both components are server components. Neither should become a client component without a concrete
reason.

### Testing Requirements
- No colocated tests. `AppHeader` is exercised by `e2e/auth.spec.ts`, which asserts the signed-in
  email is visible and clicks the "Sign out" button — keep that accessible name stable.

### Common Patterns
- `PageContainer` accepts `className` and merges it after the width classes via `cn()`, so callers
  can add layout utilities (`flex`, `gap-4`) without fighting the max-width.
- `AppHeader` composes `PageContainer` itself, so pages do not double-wrap the header.

## Dependencies

### Internal
- `lib/utils.ts` — `cn()`
- `app/(auth)/actions.ts` — `signOut`

### External
- `next/link`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
