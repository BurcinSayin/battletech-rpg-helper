<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# tests

## Purpose
The pgTAP RLS and concurrency test matrix — the most security-critical verification in the project.
It proves that the policies and RPCs in `../migrations/` actually enforce what they claim, at the
database level, rather than relying on the UI to behave.

## Key Files
| File | Description |
|------|-------------|
| `rls_matrix_test.sql` | 19 assertions (`plan(19)`) covering read/write isolation between owner, GM, and non-member, plus the version-conflict path. |

## For AI Agents

### Working In This Directory

Run it with **`supabase test db`** (not `npm test`, which is Vitest and never touches SQL). Per
`docs/PLAN.md`, this matrix is mandated to pass *before* editor UI is built on top of the schema.

**Understand the technique before extending it.** Authorization applies to the `authenticated` role,
so a test running as the privileged role would prove nothing. The file works around that:

1. Each RLS-sensitive check runs **as the `authenticated` role** with a per-user JWT claim set, and
   materializes its result into a **capture table**.
2. pgTAP assertions then run as the privileged role, reading those capture tables.

This split keeps pgTAP's own temp objects owned by a single role and avoids cross-role permission
noise. Follow the same shape for new assertions rather than asserting directly inside a role switch.

**Error-raising RPCs are wrapped in a `plpgsql` block that records the `SQLSTATE`**, so a raised
`PT409`/`PT403` becomes a value you can assert on instead of aborting the transaction.

**Fixture shape** (inserted as the privileged role, bypassing RLS): a GM owns campaign `camp`;
player A is a member with `charA` in that campaign; player B is not a member and owns a
campaign-less `charB`. That triangle is what makes owner/GM/stranger distinguishable.

**Bump the `plan(N)` count when you add or remove assertions.** pgTAP fails the run if the number of
executed tests does not match the plan — which is the intended behavior, but the error message
points at the plan rather than at your new test.

The file runs inside `begin;` and creates the `pgtap` extension in the `extensions` schema.

### Testing Requirements
This *is* the test. What to keep in mind:
- Requires the local stack running (`npx supabase start`) with migrations applied.
- **Any change to a policy, helper, or RPC in `../migrations/` needs a matching assertion here.** A
  policy change with no test change should be treated as incomplete work.
- Consider testing the negative case in both directions: not just "the owner can read it" but "the
  non-member cannot".

### Common Patterns
- `set search_path to public, extensions, pg_temp;` is set once at the top.
- Assertions are grouped by table, following the order of the policies in the init migration.

## Dependencies

### Internal
- `supabase/migrations/20260629150000_init.sql` — the policies, helpers, and RPCs under test
- `supabase/migrations/20260629145000_profiles.sql` — `profiles` and its trigger

### External
- `pgtap` extension; `auth.users` and JWT claim handling from Supabase GoTrue

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
