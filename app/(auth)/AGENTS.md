<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# (auth)

## Purpose
The guest route group: login, signup, and the auth server actions. Route-group parentheses keep it
out of the URL, so `login/page.tsx` serves `/login`.

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | The inverse guard — a signed-in user visiting `/login` or `/signup` is redirected to `/dashboard`. |
| `actions.ts` | `signIn`, `signUp`, `signOut`, and the private `authErrorMessage` sanitizer. |
| `login/page.tsx` | Thin page rendering `LoginForm`. |
| `signup/page.tsx` | Thin page rendering `SignupForm`. |

## For AI Agents

### Working In This Directory

**`authErrorMessage()` deliberately hides why auth failed. Do not make these messages more
helpful.** It collapses nearly every Supabase `AuthError` into the caller's generic fallback,
because specific text like "User already registered" or "Invalid login credentials" lets an attacker
enumerate which email addresses have accounts. Only codes that reveal nothing about account
existence get specific messages:

| Code | Message |
|------|---------|
| `over_email_send_rate_limit`, `over_request_rate_limit` | "Too many attempts. Please try again later." |
| `weak_password` | "Please choose a stronger password." |
| everything else | the generic fallback |

A bug report saying "the error message is unhelpful" is describing intended behavior. The real
reason is always logged server-side under an `[auth]` prefix.

For the same reason, a failed `signInSchema` parse returns the **same** "Invalid email or password."
string as a rejected credential — a validation failure and a wrong password are indistinguishable to
the client.

**`signUp` handles both confirmation modes.** If Supabase returns no session, the account was created
but needs email confirmation, so it redirects to `/login?notice=check-email`; with confirmations
disabled it lands on `/dashboard` directly. The `e2e/` specs depend on the second path — they need
signup to establish a session immediately.

`displayName` is passed as `display_name` user metadata, which the `handle_new_user` trigger in
`supabase/migrations/20260629145000_profiles.sql` copies into `profiles.display_name`.

**Guards live here, not in middleware.** The root `middleware.ts` only refreshes the session cookie;
putting redirect logic there — or any code between the Supabase client creation and `getUser()` —
causes random logouts.

### Testing Requirements
- No unit tests in this directory. Credential validation is tested at `lib/auth/schema.test.ts`; the
  flows are covered by `e2e/auth.spec.ts` (guard, signup, sign out, guard again), which needs a
  running Supabase stack with confirmations disabled.
- When changing error handling, verify manually that a wrong password and an unregistered email
  still produce **identical** output.

### Common Patterns
- Actions re-parse input with the Zod schema before calling Supabase — client validation is never
  trusted.
- `signOut` takes no arguments and is used directly as a form action, which is how `AppHeader`
  renders it.
- Success paths call `redirect()` (throwing `NEXT_REDIRECT`); only failures return an `AuthResult`.

## Dependencies

### Internal
- `lib/supabase/server.ts` — per-request client
- `lib/auth/schema.ts` — `signInSchema` / `signUpSchema`
- `components/auth/` — `LoginForm`, `SignupForm`

### External
- `next` (`redirect`), `@supabase/supabase-js` (`AuthError` type)

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
