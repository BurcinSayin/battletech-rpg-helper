<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# auth

## Purpose
Zod schemas for the sign-in and sign-up credential forms. Shared by the client forms in
`components/auth/` and the server actions in `app/(auth)/actions.ts`, so both sides validate against
exactly the same rules.

## Key Files
| File | Description |
|------|-------------|
| `schema.ts` | `signInSchema`, `signUpSchema`, and the inferred `SignInValues` / `SignUpValues`. |
| `schema.test.ts` | 6 cases covering the email, password, and display-name rules. |

## For AI Agents

### Working In This Directory
- **The 6-character password minimum mirrors `supabase/config.toml`'s
  `minimum_password_length = 6`.** These are two independent systems that must agree: raise one
  without the other and either the client rejects passwords the server would accept, or Supabase
  rejects a password the form called valid. Change both together.
- `signUpSchema` adds an optional `displayName`, trimmed and capped at 60 characters. It flows into
  the Supabase user metadata and is picked up by the `handle_new_user` trigger in
  `supabase/migrations/20260629145000_profiles.sql`, which copies
  `raw_user_meta_data ->> 'display_name'` into `profiles.display_name`.
- These schemas validate *shape*, not identity. Authentication itself is Supabase's; the server
  actions re-parse with these schemas before calling it, so a crafted request cannot bypass the
  client-side check.
- Keep validation messages generic about credentials. The server actions deliberately collapse most
  auth failures into a single message to prevent account enumeration — see `app/(auth)/AGENTS.md`.
  Do not add a schema-level message that reveals whether an account exists.

### Testing Requirements
- `npm run test -- lib/auth/schema.test.ts`. Node environment, no pragma needed.

### Common Patterns
- Shared field schemas (`email`, `password`) are declared once at module scope and reused by both
  object schemas, so the rules cannot drift apart.
- Inferred types are exported alongside the schemas and used as the `useForm<…>` generic.

## Dependencies

### Internal
None. Consumed by `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, and
`app/(auth)/actions.ts`.

### External
- `zod`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
