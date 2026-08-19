<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# migrations

## Purpose
The ordered SQL migrations that define the schema **and the entire authorization model**. This is
where security is actually enforced; the UI only hides affordances. `20260629150000_init.sql` is the
highest-risk file in the project and is heavily commented — read it before changing anything here.

## Key Files
| File | Description |
|------|-------------|
| `20260629145000_profiles.sql` | Step #2: `profiles` (1:1 with `auth.users`) plus the `handle_new_user` signup trigger. |
| `20260629150000_init.sql` | Step #3: campaigns, members, characters, all RLS, and the write RPCs. |

## For AI Agents

### Working In This Directory

**Migrations are append-only. Never edit one that has been applied.** Add a new timestamp-prefixed
file instead. Editing history silently desynchronizes every environment that already ran it.

**After any change here, run `npm run supabase:types` and commit
`lib/supabase/database.types.ts`.** Skipping this leaves TypeScript describing a schema that no
longer exists.

`init.sql` is sectioned to match GitHub issues #13-#16:

- **#13 — core objects.** `campaigns`, `campaign_role` enum, `campaign_members`, `characters`;
  `generate_invite_code()`; the `handle_new_campaign` trigger that auto-adds the GM as a member; a
  `touch_updated_at` trigger; and indexes on `characters.owner_id`, `characters.campaign_id`, and
  `campaign_members.user_id`.
- **#14 — RLS helpers and policies.** Eleven policies across four tables.
- **#15 — `update_character`** RPC.
- **#16 — `join_campaign`** RPC.

**The `SECURITY DEFINER` helpers are what make RLS work at all.** `is_campaign_gm`,
`is_campaign_member`, and `shares_campaign` are all `SECURITY DEFINER` + `STABLE` + `set search_path
= ''`. Running as definer bypasses RLS when reading the membership tables, which is precisely what
breaks the infinite policy recursion you would otherwise get (a policy on `campaign_members` that
queries `campaign_members`). The empty `search_path` is a hardening requirement that forces
fully-qualified names — this is why `gen_random_bytes` must be written as
`extensions.gen_random_bytes`. `is_campaign_gm` and `is_campaign_member` return false for a null
campaign, so campaign-less characters are owner-only with no special-casing at the call sites.
`shares_campaign` is the odd one out: it takes a **user id**, not a campaign id, and backs the
`profiles` read policy rather than the character path.

**`characters` has no UPDATE policy, and `authenticated` has no UPDATE grant.** That is deliberate,
not an oversight. Every character edit goes through `update_character`, which is `SECURITY DEFINER`
and therefore carries its authorization in the `WHERE` clause: `id = p_id and version =
p_expected_version and (owner_id = auth.uid() or is_campaign_gm(campaign_id))`. It whitelists
columns (`owner_id`, `version`, and timestamps are never writable from the payload), bumps `version`
itself, and rejects an anonymous caller explicitly because definer rights would otherwise apply.

Campaign attachment uses a present-vs-absent test: `p_payload ? 'campaign_id'` distinguishes "key
absent" (leave as-is) from an explicit null (detach). This is why `draftToPayload` in
`lib/characters/mapping.ts` deliberately omits the key.

**`join_campaign` is an audited definer bypass.** It exists so a player can self-join despite the
GM-only `members_insert` policy, and it is safe only because it can *only* ever insert `auth.uid()`
with role `'player'` — it cannot add another user or grant GM. Keep that invariant if you touch it.

**Custom SQLSTATEs are the API contract with the client:**

| Code | Meaning | Raised by |
|------|---------|-----------|
| `PT409` | Version conflict — wrong id, no permission, or stale version all collapse here | `update_character` |
| `PT403` | Tried to attach to a campaign the caller does not belong to | `update_character` |
| `PT404` | Invalid invite code | `join_campaign` |

`PT409` and `PT403` are classified in `lib/characters/errors.ts`. Note that "not found" and "not
permitted" intentionally produce the same code, so the client cannot probe for the existence of
characters it cannot see.

**RLS is necessary but not sufficient — the grants matter too.** Tables created by `postgres` do not
give `authenticated` the DML it needs, so without explicit grants the policies can never be reached.
`characters` is granted `select, insert, delete` only (no update — see above). `anon` is deliberately
left with no DML at all.

Functions grant `EXECUTE` to `PUBLIC` by default, so an RPC must revoke that before re-granting
narrowly. **The two RPCs do this differently, and only one of them does it correctly:**

```sql
revoke execute on function public.join_campaign(text) from anon;                        -- line 331
revoke execute on function public.update_character(uuid, integer, jsonb) from public;   -- line 353
```

Revoking from `anon` does **not** remove the implicit `PUBLIC` grant that `anon` also inherits, so
`join_campaign` remains executable by unauthenticated callers at the grant level. It is not currently
exploitable — the function opens with an `auth.uid() is null` guard that raises `42501`, which the
migration comment describes as deliberate defense — but the intended narrowing is not actually in
place. If you touch this area, `revoke execute … from public` is the correct form for both. Add a
pgTAP assertion in `../tests/` covering anon execution before changing it.

### Testing Requirements
- **`supabase test db` runs the pgTAP matrix in `../tests/` and is the authoritative check that these
  policies behave.** Per `docs/PLAN.md` it must pass before UI work builds on the schema. Any policy
  or RPC change needs a corresponding assertion there.
- `npx supabase db reset` re-applies every migration plus the seed — the quickest way to confirm a
  new migration applies cleanly from scratch.
- Then `npm run supabase:types` and `npm run typecheck` to surface affected call sites.

### Common Patterns
- Every policy-facing helper is `SECURITY DEFINER` + `STABLE` + empty `search_path`.
- Policies are named `<table>_<action>_<subject>` (`characters_select_owner_or_gm`).
- Comments state the *reasoning*, especially where something looks like a mistake. Preserve them.

## Dependencies

### Internal
- `lib/supabase/database.types.ts` — generated from this schema
- `lib/characters/` — mapping and error classification bound to this contract
- `supabase/tests/rls_matrix_test.sql` — verifies these policies

### External
- `extensions.gen_random_bytes` (pgcrypto), `auth.users` / `auth.uid()` from Supabase GoTrue

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
