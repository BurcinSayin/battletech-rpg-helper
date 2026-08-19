<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# supabase

## Purpose
Supabase client factories, one per execution context, plus the generated database types. This module
is the only place in `lib/` that knows about cookies, requests, or the browser — everything else
stays environment-agnostic.

## Key Files
| File | Description |
|------|-------------|
| `client.ts` | `createClient()` — browser client, anon key. Safe in client components. |
| `server.ts` | `async createClient()` — per-request, cookie-bound. For Server Components, Route Handlers, and Server Actions. |
| `middleware.ts` | `updateSession(request)` — refreshes the session cookie; used by the root `middleware.ts`. |
| `types.ts` | `CookieToSet` — the shared cookie tuple shape. |
| `database.types.ts` | **Generated.** Committed. Regenerate with `npm run supabase:types`. |

## For AI Agents

### Working In This Directory

**Pick the right factory.** Using the browser client on the server (or vice versa) breaks auth in
ways that surface as intermittent logouts rather than clean errors:

| Context | Import |
|---------|--------|
| Client component (`"use client"`) | `@/lib/supabase/client` |
| Server component / action / route handler | `@/lib/supabase/server` (await it) |
| Root `middleware.ts` only | `@/lib/supabase/middleware` |

**Never cache the server client.** It is bound to the current request's cookies; reusing one across
requests leaks a session between users. Call `createClient()` fresh each time.

**Never insert code between client creation and `auth.getUser()` in `middleware.ts`.** This is
explicit `@supabase/ssr` guidance and the file says so in a comment. Violating it causes
hard-to-debug random logouts. The root `middleware.ts` is intentionally logic-free for the same
reason — route protection belongs in the `(app)`/`(auth)` layouts, not here.

**The `as unknown as SupabaseClient<Database>` casts are deliberate — do not "clean them up".**
`@supabase/ssr` 0.5.2 does not thread the `Database` generic through to the much newer postgrest-js
2.108 query builder, so without the explicit return type, `.from()` and `.rpc()` infer `never` and
every typed query fails to compile. The runtime client is identical; only the type is bridged. All
three factories carry this, with an explanatory comment. Removing them will break the build in a
confusing way. They can go once `@supabase/ssr` is upgraded far enough to fix the generic plumbing.

**`server.ts`'s empty `catch` is intentional.** `setAll` throws when called from a Server Component,
where cookies are read-only. Swallowing it is correct because the session is refreshed in middleware
instead; the comment in the file explains this. Do not add error logging there — it would fire on
every server render.

**`database.types.ts` is generated and must not be hand-edited.** After any migration, run
`npm run supabase:types` (which requires the local stack running) and commit the result. It is
excluded from coverage in `vitest.config.ts`.

### Testing Requirements
- No unit tests here — these are thin factories whose behavior is the SDK's. Coverage comes from the
  `e2e/` specs, which exercise real auth against a live stack.
- After regenerating types, `npm run typecheck` is the check that matters: it surfaces every call
  site affected by a schema change.

### Common Patterns
- Environment variables are read inline with non-null assertions (`process.env.X!`) at call time,
  not module load, so builds do not fail when they are absent.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design; RLS is what protects data.
  `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never reach a client bundle.

## Dependencies

### Internal
- Consumed by `app/(app)/layout.tsx`, `app/(auth)/layout.tsx`, both `actions.ts` files, the character
  pages, and the root `middleware.ts`
- `database.types.ts` supplies `CharacterRow`/`Json` to `lib/characters/types.ts`

### External
- `@supabase/ssr` 0.5.2 — `createBrowserClient` / `createServerClient`
- `@supabase/supabase-js` — the `SupabaseClient` type
- `next/headers`, `next/server`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
