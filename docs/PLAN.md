# Battletech RPG Helper — Web Port (MVP)

## Context

The existing **Battletech Character Creator** (`/home/orin/Work/Personal/Battletech-Character-Creator`) is a C++/Qt
desktop app (~31k LOC) for creating *A Time of War* RPG characters. It works offline with local `.btcc` files and a
5-stage creation wizard. We want a **web port** that adds three things the desktop app can't do:

1. **Cloud save with data consistency** — characters live in a real database, not loose files.
2. **GM oversight** — a Game Master can view and edit the characters of players in their campaign.
3. **Mobile usability** — works on phones without a separate native codebase.

**Chosen stack (decided with user):** Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Realtime, RLS),
shipped as an installable **PWA**, deployed on Vercel.

**Scope (decided with user): MVP first.** Auth + cloud save/load + GM view/edit + a basic character *editor* +
`.btcc` import/export + PWA. The full 5-stage creation wizard and complete rules-data UX are a **later phase**.

The target repo `battletech-rpg-helper` is currently empty. The desktop app is **read-only reference** — do not modify it.

### Grounding facts (verified from source)
- Character model (`chardata.h`): scalars (name, xp, age, startXP, sex, hair, eye, height, weight, phenotype, realLife);
  name+xp pairs (affiliation, sub-affiliation, clan caste, early/late childhood, school/basic/adv/spec school);
  bools (military/police/civil field, comstar/wob); `charAttr` = 8 fixed keys STR/BOD/RFL/DEX/INT/WIL/CHA/EDG → int
  (base 100); `charSkills`/`charTraits` = ordered (name, xp) lists; plus `pre*` snapshots.
- `.btcc` format (verified vs `lisa.btcc`): newline `key:value`; repeated rows `attr:STR=250`, `skill:Name=xp`,
  `trait:Name=xp`, `preattr:DEX=400`; trailing multiline `<notes>…</notes>`.
- Rules data: `resource/*.dat`, Windows-1251, `;`-delimited (92 skills, 76 traits, affiliations, careers, subskills,
  colors, planets, descriptions). Convert cleanly to JSON.

## Architecture

- **Frontend/Backend:** Next.js App Router (server components fetch RLS-gated data; client components for the editor).
- **Data/Auth/Realtime:** Supabase. Authorization enforced **only** by Row-Level Security; UI just hides affordances.
  *One documented exception (decided in step #3):* character **writes** go through a `SECURITY DEFINER` RPC that carries
  the same authorization in its `WHERE` clause — clients have no direct `UPDATE` on `characters` (see Optimistic concurrency).
- **Roles are per-campaign:** create a campaign → you're its GM; join via invite code → you're a player. No global admin in MVP.
- **Mobile:** responsive Tailwind layout + Serwist PWA (installable, offline app shell).

## Postgres schema

**Decision: store attribute/skill/trait collections as JSONB** (not normalized child tables). They are document-shaped,
always read/written as a whole character, never queried per-skill across users, and must preserve the exact (name, xp)
shape + ordering for desktop round-trip. The legal *catalog* lives in static rules JSON, against which JSONB is
zod-validated on every write.

Tables:
- **profiles** — 1:1 with `auth.users`, created by signup trigger (display name).
- **campaigns** — `id, gm_id, name, invite_code, created_at`.
- **campaign_members** — `campaign_id, user_id, role ∈ {gm, player}`.
- **characters** — `id, owner_id, campaign_id (nullable), name, info jsonb, attributes jsonb, skills jsonb, traits jsonb,
  pre_snapshot jsonb, notes text, version int, created_at, updated_at`.

**Optimistic concurrency:** all character writes go through an RPC `update_character(p_id, p_expected_version, p_payload)`
that does `UPDATE … SET version = version + 1 WHERE id = $1 AND version = $expected`; `rowCount = 0` → raise a conflict
error. `updated_at` maintained by trigger.
- The RPC is **`SECURITY DEFINER`** and `authenticated` is **not** granted table `UPDATE` — so this RPC is the *only*
  character write path (a direct `PATCH /characters` would otherwise bypass the version check and let a client write
  `version`/`owner_id`). Because DEFINER bypasses RLS, the RPC repeats the row authorization in its `WHERE`:
  `owner_id = auth.uid() OR is_campaign_gm(campaign_id)`. Wrong id / not-permitted / stale version all collapse to
  `not found` → conflict.
- **Custom SQLSTATEs** map server errors to client UX: `PT409` version conflict (reload dialog), `PT403` attach to a
  campaign you're not a member of, `PT404` invalid invite code. `campaign_id` uses a present-vs-absent (`payload ?
  'campaign_id'`) check so it can be cleared (set to null), and INSERT/attach require membership in the target campaign.
- Whitelisted payload columns only — `owner_id`, `version`, timestamps are never client-writable, so `owner_id` is immutable.

## RLS policies (plain English; enabled on every table)
- **profiles** — read own + profiles sharing a campaign; write only own row.
- **campaigns** — read if GM or member; insert by any authed user (force `gm_id = auth.uid()`); update/delete only GM.
- **campaign_members** — read if GM of campaign or the member; GM inserts members (or self-join via invite RPC); delete by GM or self.
- **characters** — SELECT/DELETE if `owner_id = auth.uid()` OR `is_campaign_gm(campaign_id)`. INSERT requires
  `owner_id = auth.uid()` **and** `campaign_id` is null or one the owner belongs to (`is_campaign_member`/`is_campaign_gm`),
  so nobody can inject a character into a campaign they're not in. **No `UPDATE` policy** — updates go through the
  `update_character` DEFINER RPC (above), and `authenticated` has no table `UPDATE` grant.
- Use **SECURITY DEFINER helper functions** (`is_campaign_gm`, `is_campaign_member`, `shares_campaign`) to avoid policy
  recursion. Tables created by `postgres` only grant `Dxtm` to `authenticated` by default, so the migration also issues
  explicit DML grants per table (and `anon` is left with no DML).

## Rules data ingestion

**Decision: static JSON in the repo** (not DB reference tables). Rules are read-only, identical for all users, tiny
(~168 rows), versioned with code, need no RLS, validate with zero latency on server + client, and work offline for the PWA.
- One-time `scripts/convert-dat.ts` (Node + `iconv-lite` for 1251) reads the source `resource/*.dat`, emits typed JSON to
  `data/rules/`, committed to the repo.
- Compose composite skill names from `subskill.dat` to match `.btcc` naming (e.g. `Animal Handling/Riding`).
- Descriptions lazy-loaded only in detail panels.

## Character editor
Server component fetches the row + rules JSON, passes data + `version` to a client editor built on **react-hook-form + zod**.
Panels: `BasicInfoForm`, `AttributesPanel` (8 steppers), `SkillsTable`, `TraitsTable`, `XpSummary`, `NotesEditor`.
- **Save** = explicit button → `update_character` RPC with `expected_version`; conflict → reload dialog (no autosave).
- **Realtime:** subscribe to `postgres_changes` filtered `id=eq.<id>`. Remote higher-version update hot-swaps when the local
  form is clean; otherwise shows a non-destructive "remote changes available" banner. Realtime respects RLS (GM live edits).

## .btcc import/export (`lib/btcc/`)
- `parseBtcc(text)`: split on first `:`; accumulate attr/skill/trait/pre* preserving order; capture `<notes>…</notes>`
  verbatim; tolerate empty values; normalize CRLF.
- `serializeBtcc(draft)`: emit keys in the exact desktop order, then attr/skill/trait/preattr rows, then notes —
  **byte-compatible round-trip** so files reopen in the desktop app.
- Import is client-side (read file → parse → warn on unknown catalog names, don't hard-fail → insert). Export = Blob download.

## Project structure
- `app/(app)/` authed route group (layout guards session): `dashboard`, `characters/[id]` (server shell + `editor-client.tsx`), `campaigns/[id]`.
- `lib/supabase/{client,server,middleware}.ts`, `lib/btcc/{parse,serialize,types}.ts`, `lib/rules/`, `lib/validation/` (zod).
- `data/rules/*.json` (generated), `scripts/convert-dat.ts`, `supabase/migrations/*.sql`.

## Key libraries
`@supabase/supabase-js` + `@supabase/ssr`; Tailwind + shadcn/ui (Radix); react-hook-form + zod + resolvers;
**Serwist (`@serwist/next`)** for PWA; `iconv-lite` (dev script only); Vitest + Playwright for tests.

## Build order
1. Bootstrap: Next + TS + Tailwind + shadcn + Supabase clients + env wiring.
2. Auth: email/password, profiles signup trigger, middleware session refresh, route guard.
3. Schema + RLS + RPCs + generated TS types (`supabase/migrations/20260629150000_init.sql`).
4. Rules ingestion: `scripts/convert-dat.ts` → `data/rules/*.json` + zod schemas.
5. Character CRUD + editor + version-guarded save (single user).
6. `.btcc` import/export + golden round-trip test against `lisa.btcc`.
7. Campaigns + GM edit + realtime subscription.
8. PWA: Serwist + manifest + offline shell + responsive/mobile polish.
9. Vercel deploy + conflict UX polish.

## Critical files to create
- `supabase/migrations/20260629150000_init.sql` — tables, RLS, helper functions, `update_character` RPC.
- `lib/btcc/parse.ts`, `lib/btcc/serialize.ts` — `.btcc` round-trip.
- `app/(app)/characters/[id]/editor-client.tsx` — character editor.
- `scripts/convert-dat.ts` — `.dat` → JSON rules.
- `lib/supabase/server.ts`, `lib/supabase/client.ts` — Supabase clients.

Reference (read-only): `…/Battletech-Character-Creator/chardata.h`, `lisa.btcc`, `resource/*.dat`.

## Verification
- **Unit (Vitest):** `.btcc` parse→serialize golden test (parse `lisa.btcc`, serialize, assert byte-equality); rules
  loaders; zod validation; version-conflict logic.
- **RLS test matrix (SQL)** — most security-critical, run *before* building UI: player A cannot read B's characters; GM can
  read+write members' characters; non-member denied; stale version → conflict.
- **E2E (Playwright):** signup → create/edit character → export → import → GM edits a member's character → realtime sync.
- **PWA:** Lighthouse installability/offline check on mobile viewport.
- **Compatibility:** open an exported `.btcc` in the desktop app and confirm it loads.

## Riskiest decisions to watch
1. **RLS recursion + GM cross-user write** — `campaign_members`/`characters` policies can recurse or leak; mitigate with
   SECURITY DEFINER helpers and the RLS test matrix before any UI. Highest risk. *Resolved in step #3:* helpers avoid
   recursion; a code review then found that granting table `UPDATE` (needed for an INVOKER RPC) exposed a direct-`PATCH`
   path bypassing the version/owner guards — fixed by making `update_character` `SECURITY DEFINER`, dropping the `UPDATE`
   grant, and validating `campaign_id` against membership. The pgTAP matrix now covers these write-path cases.
2. **.btcc fidelity** — desktop folds affiliation/module XP into wizard-recomputed state and the `<notes>` block rather than
   persisting every number; decide (fixture-driven) what is canonical vs. preserved verbatim before locking the `info` JSONB shape.
3. **Concurrency UX** — version column prevents lost writes; MVP keeps merge simple (explicit Save + conflict dialog +
   non-destructive realtime banner, no field-level merge).
