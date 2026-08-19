<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# auth

## Purpose
The sign-in and sign-up forms plus the small field wrapper they share. These are the only screens
that use the neutral `foreground/*` palette rather than the HUD theme.

## Key Files
| File | Description |
|------|-------------|
| `field.tsx` | `Field` — label + input + error text, and the exported `fieldClass` string. Server component. |
| `login-form.tsx` | `LoginForm` — email/password, calls `signIn`. |
| `signup-form.tsx` | `SignupForm` — adds optional display name, calls `signUp`. |

## For AI Agents

### Working In This Directory
- Both forms follow one shape: client component, `useForm` with `zodResolver` against the schema in
  `lib/auth/schema.ts`, then the server action invoked inside `useTransition`, with any returned
  error stored in `serverError` state and rendered inline. Follow it for any new auth screen.
- **Never restate a server auth error in more specific terms.** The actions in
  `app/(auth)/actions.ts` sanitize errors on purpose to prevent account enumeration; render
  `serverError` exactly as given.
- Client-side Zod validation is a convenience only — the server actions re-parse every input, so do
  not treat passing client validation as a guarantee.
- Use `Field` and `fieldClass` rather than hand-rolling inputs, so labels stay wired to inputs by
  `id` and error text stays associated. `Field` accepts a `registration` prop that takes the result
  of react-hook-form's `register()` directly.
- These forms use `foreground/*` tokens; the `hud.*` palette belongs to the character editor. Keep
  them distinct.

### Testing Requirements
- No colocated tests. Schema rules are covered by `lib/auth/schema.test.ts`, and the flows by
  `e2e/auth.spec.ts`.
- That spec locates fields via the "Email" and "Password" labels and the "Create account" /
  "Sign out" button names — changing a visible label or button text breaks it, so update the spec in
  the same change.

### Common Patterns
- Both components keep `isPending` from `useTransition` and disable the submit button with it.
- Cross-links between login and signup use `next/link`.

## Dependencies

### Internal
- `lib/auth/schema.ts` — `signInSchema` / `signUpSchema` and their inferred types
- `app/(auth)/actions.ts` — `signIn`, `signUp`
- `lib/utils.ts` — `cn()`

### External
- `react-hook-form`, `@hookform/resolvers/zod`, `zod`, `next/link`

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
