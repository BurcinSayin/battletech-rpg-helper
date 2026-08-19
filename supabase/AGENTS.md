<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# supabase

## Purpose
Local Supabase stack configuration, the SQL migrations that define the entire authorization model,
the RLS test matrix, and the generated dev seed. This directory is where the project's security
boundary actually lives — the UI only hides affordances.

## Key Files
| File | Description |
|------|-------------|
| `config.toml` | Local stack config: ports, Postgres version, auth settings, seed wiring. |
| `seed.sql` | **Generated** by `npm run seed:generate`. Loaded on `db reset`. Never hand-edit. |
| `.gitignore` | Ignores `.branches`, `.temp`, and dotenvx key files. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `migrations/` | The two ordered SQL migrations — tables, RLS, and the write RPCs (see `migrations/AGENTS.md`) |
| `tests/` | pgTAP RLS + concurrency matrix (see `tests/AGENTS.md`) |
| `snippets/` | Empty placeholder — no files yet. |

## For AI Agents

### Working In This Directory
- The CLI is a **devDependency**, so invoke it as `npx supabase …` (or via the npm scripts, where
  `supabase` already resolves to the local binary). Do not assume a global install.
- `npx supabase start` brings the stack up; `npm run supabase:start` does a `stop --all` first,
  which is the reliable way to recover a wedged stack.
- **After any schema change, run `npm run supabase:types` and commit
  `lib/supabase/database.types.ts`.** Skipping this leaves TypeScript describing a database that no
  longer exists.
- `npx supabase db reset` re-applies every migration and then the seed — the standard way to get a
  known-good local database.

### Local stack reference
| Service | Port | Notes |
|---------|------|-------|
| API (PostgREST/GoTrue) | 54321 | `NEXT_PUBLIC_SUPABASE_URL` target |
| Postgres | 54322 | `major_version = 17` |
| Studio | 54323 | Web UI |
| Inbucket | 54324 | Captured outbound mail |
| Pooler | 54329 | `enabled = false` |

Config values that are **mirrored in application code** and must be changed in both places:
- `minimum_password_length = 6` ↔ the password rule in `lib/auth/schema.ts`.
- `site_url = "http://127.0.0.1:3000"` ↔ the dev server origin.
- `[db.seed] sql_paths = ["./seed.sql"]` is what makes `db reset` load the generated seed.

Realtime and Storage are enabled; the analytics and vector storage backends are not.

### Testing Requirements
- `supabase test db` runs the pgTAP matrix in `tests/`. This is the authoritative check that RLS
  behaves as designed, and per `docs/PLAN.md` it must pass before UI work builds on the schema.
- E2E specs in `e2e/` additionally require this stack running with **email confirmations disabled**,
  because they depend on signup yielding a session immediately.

### Common Patterns
- Migrations are timestamp-prefixed and append-only.
- Helper functions used inside policies are `SECURITY DEFINER` with an empty `search_path`.
- Custom SQLSTATEs carry semantics to the client: `PT409` version conflict, `PT403` forbidden.

## Dependencies

### Internal
- `scripts/generate-seed.ts` — produces `seed.sql`
- `lib/supabase/database.types.ts` — generated *from* this schema
- `lib/characters/errors.ts` — consumes the `PT409`/`PT403` codes raised here

### External
- `supabase` CLI (devDependency), Docker (the stack runs in containers)
- `pgtap` and `pgcrypto`/`gen_random_bytes` from the `extensions` schema

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
