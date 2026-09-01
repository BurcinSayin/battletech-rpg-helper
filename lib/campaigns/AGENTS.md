<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-01 | Updated: 2026-09-01 -->

# campaigns

## Purpose
The campaign domain layer: form validation for create/join, classification of the `join_campaign`
RPC's custom error code, and the pure grouping function the campaign roster renders. Everything here
is pure — no database access — which is what lets the roster's "every member appears, even with no
characters" and "null display names fall back" rules be unit-tested without a stack running.

## Key Files
| File | Description |
|------|-------------|
| `schema.ts` | `createCampaignSchema`, `joinCampaignSchema` — both mirror a DB constraint. |
| `errors.ts` | `classifyJoinError` — maps `PT404` to a union. Separate from `lib/characters/errors.ts`, which is scoped to `update_character`. |
| `group.ts` | `groupCharactersByMember`, `MEMBER_FALLBACK_NAME`. |
| `index.ts` | Barrel — **import from `@/lib/campaigns`**, not the individual files. |

## For AI Agents

### Working In This Directory
- **The schemas mirror the database, they do not replace it.** `createCampaignSchema`'s 1..100 name
  bound matches `char_length(name) between 1 and 100` (`supabase/migrations/20260629150000_init.sql:32`),
  and `joinCampaignSchema`'s `/^[0-9A-F]{8}$/` matches what `generate_invite_code()` emits. If either
  DB rule changes, change it here too — but never treat the client check as the enforcement.
- The invite-code schema **normalizes before validating** (`.trim().toUpperCase()`): users paste
  codes in whatever case they were given, and the DB stores upper-case hex.
- `groupCharactersByMember` deliberately keeps a character whose `owner_id` is not in the member
  list rather than dropping it. Silently discarding rows the database chose to return would hide a
  real inconsistency; surfacing it under a fallback label does not.

### Testing Requirements
- `npm run test -- lib/campaigns`. All three modules are pure, so the tests need no mocks and no
  database.
- The grouping tests are the coverage for "every member appears" and "null/blank display name falls
  back" — the campaign page itself has no render test.
