<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# app

## Purpose
Next.js 15 App Router root. Routing is split into two **route groups** that differ only in who
may see them: `(app)` requires a session, `(auth)` requires the absence of one. Route-group
parentheses are organizational — they do not appear in URLs, so `(auth)/login/page.tsx` serves
`/login`.

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | Root layout — bare `<html>`/`<body>` shell plus the `Metadata` export. Deliberately carries no auth logic. |
| `page.tsx` | Public landing page at `/`. Static copy pointing at `docs/PLAN.md`; the only page outside both route groups. |
| `globals.css` | Tailwind entry point and global theme layer. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `(app)/` | Authed route group: dashboard, characters, campaigns (see `(app)/AGENTS.md`) |
| `(auth)/` | Guest route group: login, signup, auth server actions (see `(auth)/AGENTS.md`) |
| `style-guide/` | Empty. No `AGENTS.md` until it has content. |

## For AI Agents

### Working In This Directory
- **Auth guards belong in the group layouts** (`(app)/layout.tsx`, `(auth)/layout.tsx`), never in
  `middleware.ts`. The root `middleware.ts` exists only to refresh the Supabase session cookie.
- Being signed in is the *only* thing these layouts check. Every finer-grained authorization
  question is answered by RLS in the database — never by hiding UI.
- Server Components are the default. Add `"use client"` only at interactive leaves
  (`editor-client.tsx`, `import-client.tsx`, the auth forms), keeping data fetching on the server.
- Server actions live in `actions.ts` files beside the routes that use them and must start with
  `"use server"`.

### Testing Requirements
- Unit tests are colocated as `*.test.tsx` and must declare `// @vitest-environment jsdom` in
  their first lines — Vitest defaults to the `node` environment.
- Run a single one with `npm run test -- "app/(app)/characters/import/import-client.test.tsx"`.
- Full-flow coverage lives in `e2e/` and needs a running local Supabase stack.

### Common Patterns
- Pages wrap content in `PageContainer` from `components/layout/page-container.tsx` and pick a
  width tier rather than setting `max-w-*` directly.
- Dynamic route params are a `Promise` in Next 15: `const { id } = await params`.
- Server actions return typed result objects for expected failures instead of throwing, so forms
  can render errors inline.

## Dependencies

### Internal
- `lib/supabase/server.ts` — per-request client used by every server component and action
- `lib/characters/` — mapping, schema, and XP helpers consumed by the character routes
- `components/` — all presentational markup

### External
- `next` 15 (App Router, server actions), `react` 19
- `@supabase/ssr` — cookie-bound auth

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
