# Battletech RPG Helper — Web Port (MVP)

## Context

The existing **Battletech Character Creator** (`D:\Work\Personal\Battletech-Character-Creator`) is a C++/Qt
desktop app (~31k LOC) for creating *A Time of War* RPG characters. It works offline with local `.btcc` files and a
5-stage creation wizard. We want a **web port** that adds three things the desktop app can't do:

1. **Cloud save with data consistency** — characters live in a real database, not loose files.
2. **GM oversight** — a Game Master can view and edit the characters of players in their campaign.
3. **Mobile usability** — works on phones without a separate native codebase.

**Chosen stack (decided with user):** Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Realtime, RLS),
shipped as an installable **PWA**, deployed on Vercel.

**Scope (decided with user): MVP first.** Auth + cloud save/load + GM view/edit + a basic character *editor* +
`.btcc` import/export + PWA. The full 5-stage creation wizard and complete rules-data UX are a **later phase**.

The desktop app is **read-only reference** — do not modify it. Its character-generation rules are transcribed,
with every claim cited to source at `Battletech-Character-Creator@a1d8009`, in [`docs/RULES.md`](./RULES.md).

Where this document sits in the doc set:

- `docs/PLAN.md` — intended design and build order. Not a progress record.

### Grounding facts (verified from source)
- Character model (`chardata.h`): scalars (name, xp, age, startXP, sex, hair, eye, height, weight, phenotype, realLife);
  name+xp pairs (affiliation, sub-affiliation, clan caste, early/late childhood, school/basic/adv/spec school);
  bools (military/police/civil field, comstar/wob); `charAttr` = 8 fixed keys STR/BOD/RFL/DEX/INT/WIL/CHA/EDG → int
  (base 100); `charSkills`/`charTraits` = ordered (name, xp) lists; plus `pre*` fields — which hold
  **prerequisites** (attribute/skill/trait minimums, stored ×100), not a baseline snapshot: `docs/RULES.md` §1.2.
- `.btcc` format (verified vs `lisa.btcc`): newline `key:value`; repeated rows `attr:STR=250`, `skill:Name=xp`,
  `trait:Name=xp`, `preattr:DEX=400`; trailing multiline `<notes>…</notes>`.
- Rules data: `resource/*.dat`, Windows-1251, `;`-delimited (92 skills, 76 traits, affiliations, careers, subskills,
  colors, planets, descriptions). Convert cleanly to JSON.
- Encoding, refined during ingestion: the catalog `.dat` files listed above are pure ASCII; only the description
  files (`skillsdesc.dat`, `traitsdesc.dat`) are Windows-1251. See **Rules data ingestion** below.

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
- One-time `scripts/convert-dat.ts` reads the source `resource/*.dat` and emits typed JSON to `data/rules/`,
  committed to the repo. It reads each file as `latin1` (`scripts/convert-dat.ts:34`), which suffices because the
  catalog files are pure ASCII — no transcoding dependency is installed or required. The Windows-1251 description
  files are deferred, as `convert-dat.ts:12-13` records.
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
- Import parses client-side (read file → parse → warn on unknown catalog names, don't hard-fail); the row is then
  written by the `importCharacter` server action (`app/(app)/characters/actions.ts`), which re-validates before
  inserting. Export = Blob download.

## Project structure
- `app/(app)/` authed route group (layout guards session): `dashboard`, `characters/[id]` (server shell + `editor-client.tsx`), `campaigns/[id]`.
- `lib/supabase/{client,server,middleware}.ts`, `lib/btcc/{parse,serialize,types}.ts`, `lib/rules/`, `lib/validation/` (zod).
- `data/rules/*.json` (generated), `scripts/convert-dat.ts`, `supabase/migrations/*.sql`.

## Key libraries
`@supabase/supabase-js` + `@supabase/ssr`; Tailwind; react-hook-form + zod + resolvers;
**Serwist (`@serwist/next`)** for PWA; Vitest + Playwright for tests.

`components.json` configures a shadcn-style component output directory at `components/ui/`; that directory holds
only `.gitkeep`, and no component-primitive package is a dependency — the UI is hand-written under `components/`.

## Build order

`docs/PLAN.md` records intended design and order, not progress. Do not add status marks to it; build status is
answered by `git log` and GitHub issues.

1. Bootstrap: Next + TS + Tailwind + shadcn + Supabase clients + env wiring.
2. Auth: email/password, profiles signup trigger, middleware session refresh, route guard.
3. Schema + RLS + RPCs + generated TS types (`supabase/migrations/20260629150000_init.sql`).
4. Rules ingestion: `scripts/convert-dat.ts` → `data/rules/*.json` + zod schemas.
5. Character CRUD + editor + version-guarded save (single user).
6. `.btcc` import/export + golden round-trip test against `lisa.btcc`.
7. Campaigns + GM edit + realtime subscription.
8. PWA: Serwist + manifest + offline shell + responsive/mobile polish.
9. Vercel deploy + conflict UX polish.
10. Rules remediation — correct the four entries in **Known rules defects**.
11. C++ rules extraction — `scripts/extract-rules.ts` → `data/rules/modules.json`.
12. Wizard shell + Stage 0 (Affiliation).
13. Stages 1–2 + flex XP + prerequisites.
14. Stages 3–4, completion, and handoff.

**Execution order.** The numbering is an identifier, not a schedule: **10 runs before 7**, 8 and 9. Two reasons,
both binding — (i) every lifepath module charges XP, so steps 12–14 must not be built on a wrong XP model, and
`lib/characters/xp.ts` diverges from the desktop by roughly 800 XP per character; and (ii) step 10 is a schema plus
write-path change, and the campaigns, PWA and deploy work **adds consumers of that write path** — the same character
rows, read and written through `update_character` — so doing 10 first avoids migrating a live consumer surface.
`lib/characters/xp.ts` needs **no data backfill**, because `remaining` is computed, not persisted.

Steps 10–14 are specified below; each carries its own acceptance criteria as plain bullets.

### Step 10 — Rules remediation

Correct the four defects tabulated under **Known rules defects**. This is a schema plus write-path change, so it
lands ahead of the campaigns, PWA and deploy steps for the reason given under *Execution order*.

- `lib/characters/xp.ts` charges the **full** attribute value: `attributeXp(v) === v` replaces `max(0, v - 100)`,
  matching `RULES.md` §2.2. `lib/characters/xp.test.ts` gains a case asserting an all-100 character consumes 800 XP.
- `gmxpmod` becomes a term in the budget calculation rather than a display field, per `RULES.md` §2.5; a test in
  `lib/characters/xp.test.ts` asserts a non-zero `gmxpmod` changes `remaining`.
- A migration under `supabase/migrations/` renames `pre_snapshot` → `prerequisites`;
  `lib/supabase/database.types.ts` is regenerated (`npm run supabase:types`); `lib/characters/mapping.ts` and
  `lib/btcc/` are updated; `npm run typecheck` passes with zero errors.
- `data/rules/skills.json`'s `cost` key is renamed `targetNumber` in `scripts/convert-dat.ts`, the Zod shape
  (`lib/validation/catalog.ts:10`), and the regenerated JSON, per `RULES.md` §2.3; `npm run test` passes.
- The `.btcc` golden round-trip test (`lib/btcc/roundtrip.test.ts`) continues to pass byte-identically — the rename
  must not alter on-disk key order (`RULES.md` §1.1).

### Step 11 — C++ rules extraction

`scripts/extract-rules.ts` reads the desktop's stage tables and emits `data/rules/modules.json`. This is materially
harder than step 4's `.dat` ingestion. Step 4 parses small `;`-delimited catalogs with a stable row shape; step 11
must read imperative C++ across five files of this size:

| Desktop file | `wc -l` |
|---|---|
| `stage1_resurce.cpp` | 808 |
| `stage2_resurce.cpp` | 1092 |
| `stage3_resurce.cpp` | 894 |
| `stage4_resurce.cpp` | 2628 |
| `text_resurce.cpp` | 2843 |

The extraction targets are enumerated in `RULES.md` §8. Those eight commands and their counts, reproduced:

| Class | Desktop file | Command | Lines | What it dispatches |
|---|---|---|---|---|
| M | `stage1_resurce.cpp` | `grep -c 'nameChild =='` | 11 | Early Childhood modules |
| M | `stage2_resurce.cpp` | `grep -c 'nameLChild =='` | 13 | Late Childhood modules |
| M | `stage3_resurce.cpp` | `grep -c 'nameElem =='` | 78 | field + school modules |
| M | `stage4_resurce.cpp` | `grep -c 'nameElem =='` | 25 | Real Life modules |
| G | `stage2_resurce.cpp` | `grep -c 'nameAttr =='` | 11 | sibko attribute picks |
| G | `stage2_resurce.cpp` | `grep -c 'nameClan =='` | 2 | clan-specific branches |
| G | `stage3_resurce.cpp` | `grep -c 'school == "'` | 10 | school-change branches |
| G | `stage3_resurce.cpp` | `grep -c 'affVar == "'` | 4 | affiliation gating |

Table M (selectable lifepath modules) totals **127**; Table G (gating and branch blocks) totals **27**; all eight
rows together total **154**. Table G blocks *select among* or *modify* modules and are not themselves modules — a
distinction the extractor must honour. Occurrence counts are also not name counts: stage 3's 78 `nameElem` lines
carry **66 distinct** names, being 9 schools at two lines apiece plus 57 field modules.

Three complications rule out a single-regex extractor: (i) each stage names its dispatch parameter differently —
`nameChild`, `nameLChild`, `nameElem`, `nameClan` — so no one pattern covers all four files; (ii) availability
gating is by **numeric affiliation index**, not by name (`stage1_resurce.cpp:88-140`), so extraction must join
`resource/affilations.dat` to resolve indices; and (iii) module blocks write into member state that a preamble
clears, so a block's meaning depends on that reset — a purely textual extractor will miss defaults.

- `scripts/extract-rules.ts` emits `data/rules/modules.json` whose per-stage entry counts **equal the Table M counts
  published in `RULES.md` §8** (not a number hard-coded here); a test in `scripts/extract-rules.test.ts` reads §8's
  counts and asserts agreement.
- Table G's gating and branch blocks are emitted **separately** from module entries in `data/rules/modules.json` —
  sibko attribute picks and school-change branches are not modules (`RULES.md` §6.1, §8).
- Each module entry carries: stage, name, XP cost, attribute deltas (raw XP), signed trait grants, skill grants,
  deferred `"…/Any"` picks, and prerequisites **in ×100 form**, matching `RULES.md` §7.4.
- Availability gating is emitted as **resolved affiliation names**, not numeric indices — the extractor joins
  `resource/affilations.dat` (`RULES.md` §6.1); a test asserts no entry carries a bare integer in `availability`.
- The "Born Mercenary Brat" entry in `data/rules/modules.json` equals, field for field, the worked example in
  `RULES.md` §7.4; and running `scripts/extract-rules.ts` twice produces byte-identical output.

### Step 12 — Wizard shell + Stage 0 (Affiliation)

- A `/characters/new/wizard` route under `app/(app)/` renders a 6-page shell whose page order and ids match
  `RULES.md` §7.1.
- Stage 0 lets the user pick affiliation, sub-affiliation, and (when Clan) caste, sourced from
  `data/rules/modules.json`.
- Selecting a Stage 0 module applies its grants to an in-memory draft and debits its XP cost using the **corrected**
  step-10 model in `lib/characters/xp.ts` (`RULES.md` §2.2).
- Back-navigation from a later stage discards that stage's choices, matching `RULES.md` §7.3. `BackChange()`
  (`wizard.cpp:155-191`) runs **after** `QWizard::back()` (`wizard.cpp:208-209`), so its `switch` sees the
  **destination** page id. There is no `case 0` for the Intro page, and no `S0RemoveOldParam()` exists anywhere
  in the desktop tree, so backing out of Stage 0 unwinds nothing. The port must not reproduce that
  (`RULES.md` §9.6).
- A Vitest case in `app/(app)/characters/new/wizard/wizard.test.tsx` drives Stage 0 for one affiliation and asserts
  the draft's XP total equals a value hand-computed from `RULES.md` §2.8.

### Step 13 — Stages 1–2 + flex XP + prerequisites

- Stage 1 and Stage 2 pages list only modules the Stage 0 selection makes available, per `RULES.md` §6.1.
- Flex XP is spent from a **per-module allowance not deducted from the main pool**, honouring the caps (35 skills /
  200 traits and attributes) and per-module restrictions (`RULES.md` §4). Stage 1 offers no flex XP.
- A prerequisite engine in `lib/characters/prereq.ts` max-merges `preattr`/`preskill`/`pretrait` across selected
  stages and reports unmet prerequisites, mirroring `CheckPrereq` (`RULES.md` §6.2), treating stored values as ×100.
- A test in `lib/characters/prereq.test.ts` flags a fixture whose Stage 2 module has an unmet prerequisite and
  clears it when the attribute rises; a second asserts that flex XP spent from a module allowance leaves
  `XP_remaining` unchanged (`RULES.md` §4).

### Step 14 — Stages 3–4, completion, and handoff

- Stage 3 (School) and Stage 4 (Real Life) render, are **skippable**, and Stage 4 is repeatable; Stage 3 charges
  550–830 + 30/field-skill and applies its rebate (`RULES.md` §7.4).
- Stage 4's advanced sub-dialog (`RULES.md` §7.5.7 — `S4AdvDial`) is implemented as part of the stage: it grants and
  unwinds skills, traits, and attributes symmetrically, matching the desktop's Stage-4 path.
- On completion the wizard computes `gmxpmod` as the **reconciliation residual** defined in `RULES.md` §2.5 —
  MainWindow's recomputed remaining XP minus the wizard's running total — **not** as a naive
  `Σ(module costs) − Σ(granted stat XP)`. A test asserts the residual is 0 when grants and costs reconcile exactly.
- The finished draft is inserted via the existing create path and opens at
  `app/(app)/characters/[id]/editor-client.tsx` with an XP summary matching the wizard's.
- A round-trip test in `lib/btcc/roundtrip.test.ts` exports the wizard-built character to `.btcc`, re-imports it,
  and asserts byte equality; and a full 5-stage run produces `XP_remaining ≥ 0` (`RULES.md` §2.8).

## Known rules defects

Four points where the port disagrees with the desktop. All four are documented here rather than fixed by this
document, and all four are scheduled for step 10. Desktop citations resolve against
`Battletech-Character-Creator@a1d8009`; the corresponding rules text is in `docs/RULES.md`.

| Defect | Port file | Desktop `file:line` | Impact | Fixing step |
|---|---|---|---|---|
| `xp.ts` charges `attr − 100`, leaving each attribute's first 100 points free | `lib/characters/xp.ts` | `mainwindow.cpp:830-833` | The desktop sums attributes at **full** value, so the port under-charges by 8 × 100 = 800 XP per character — 16% of the 5000 budget (`RULES.md` §2.2) | step 10 |
| `gmxpmod` is treated as display-only and excluded from the budget | `lib/characters/xp.ts`, `lib/characters/schema.ts` | `mainwindow.cpp:397-401` | In the desktop it is load-bearing and **derived** — `wizardMod = XP - wz->chr_dat->xp` — so a wizard-built character re-costs wrongly (`RULES.md` §2.5) | step 10 |
| `pre_snapshot` names a baseline snapshot but holds **prerequisites** | `supabase/migrations/20260629150000_init.sql`, `lib/characters/mapping.ts` | `mainwindow.cpp:3295-3427` | The name invites code that treats the column as a pre-edit copy; the values are attr/skill/trait minimums stored ×100 (`RULES.md` §1.2, §6.2) | step 10 |
| `skills.json`'s `cost` key is a **Target Number**, not an XP price | `data/rules/skills.json`, `scripts/convert-dat.ts` | `loadresurce.cpp:22-43` | Any XP arithmetic reading `skills.json.cost` as a price is wrong; the loader reads it as the skill's TN (`RULES.md` §2.3) | step 10 |

`RULES.md` §9 lists the desktop's own bugs and internal inconsistencies separately. Those are defects in the canon,
not in the port; each needs a case-by-case decision on whether the port reproduces it. Step 12's back-navigation
criterion is one such decision.

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
