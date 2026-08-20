<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# (app)

## Purpose
The authenticated route group: dashboard, character CRUD and editor, `.btcc` import, and the
campaign view. The parenthesized name is a Next.js route group — it organizes files
without appearing in URLs, so `dashboard/page.tsx` serves `/dashboard`.

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | The auth guard for everything below: `getUser()` then redirect to `/login`, followed by the `AppHeader`. |
| `characters/actions.ts` | All character server actions: `createCharacter`, `importCharacter`, `saveCharacter`, `deleteCharacter`. |

## Routes
| Path | Files | Notes |
|------|-------|-------|
| `/dashboard` | `dashboard/page.tsx` | Server component listing the user's characters with create/open/delete. |
| `/characters/[id]` | `characters/[id]/page.tsx` + `editor-client.tsx` | Server shell fetches and maps the row; the 381-line client component is the editor. |
| `/characters/import` | `characters/import/page.tsx` + `import-client.tsx` | Drop-zone, parse, preview, commit. |
| `/campaigns/[id]` | `campaigns/[id]/page.tsx` | Nine lines. Returns `<div>Campaign {id} (TODO step #7)</div>`; no data fetching. The design is `docs/PLAN.md` step 7. |

## For AI Agents

### Working In This Directory

**The layout guard checks one thing: that you are signed in.** Every other authorization question —
can this user read this character, may a GM edit it — is answered by RLS in the database. Do not add
ownership checks here and treat them as security; they are at best a UX nicety, and at worst they
give a false sense of protection. Note that `dashboard/page.tsx` filters by `owner_id` purely to
scope the list to "my characters"; RLS would also expose characters from campaigns the user GMs.

**The version-guarded save is the central pattern of this codebase.** Understand it before touching
`saveCharacter` or the editor:

1. `characters/[id]/page.tsx` (server) fetches the RLS-gated row, maps it with `rowToDraft`, and
   passes the draft **plus `row.version`** to the client.
2. `editor-client.tsx` holds that `version` in state and only updates it after a successful save.
3. `saveCharacter(id, expectedVersion, values)` re-validates with `characterFormSchema`, then
   **re-fetches the row server-side** and merges via `formToDraft(rowToDraft(row), parsed.data)`,
   then calls `update_character(p_id, p_expected_version, p_payload)`.

**The server-side re-fetch is not redundant — it is the mechanism.** The client only ever sends the
fields it edits. Merging onto a freshly-read row is what keeps sections the MVP editor never
touches (`equip`, `weapons`, `pre*`) intact through a save, which is what preserves `.btcc`
fidelity. Do not "optimize" it away by trusting a client-sent draft.

**Character updates must go through the RPC.** The `characters` table has no RLS `UPDATE` policy and
`authenticated` has no table UPDATE grant, so a direct `.update()` will simply fail. Inserts and
deletes do go direct through RLS-gated table access.

**Server actions return typed results instead of throwing** for expected failures, so forms can
render them inline. `SaveResult` is a union of ok-with-version, conflict, and forbidden/error with a
message. `PT409` produces the `ConflictDialog` (reload vs. keep editing); `PT403` produces a
"can't save to that campaign" message. Classification lives in `lib/characters/errors.ts` — never
string-match error codes here.

Actions that navigate (`createCharacter`, `deleteCharacter`, and `importCharacter` on success) call
`redirect()`, which throws `NEXT_REDIRECT` and never returns — which is why `ImportResult` only
describes failures. Mutations call `revalidatePath()` for the affected routes before redirecting.

### Testing Requirements
- `import-client.test.tsx` is the only unit test here (5 cases) and **requires
  `// @vitest-environment jsdom`**; Vitest defaults to `node`. Run with
  `npm run test -- "app/(app)/characters/import/import-client.test.tsx"`.
- The real coverage for these flows is `e2e/character-editor.spec.ts` and
  `e2e/character-import.spec.ts`, which need a running local Supabase stack.
- Conflict handling (`PT409`) is not covered by an e2e spec — to exercise it manually, open the same
  character in two tabs, save in one, then save in the other.

### Common Patterns
- Dynamic params are a Promise in Next 15: `const { id } = await params`.
- A missing or RLS-invisible row becomes `notFound()` — a 404, not a 403, so the UI never reveals
  that a character exists but is not yours.
- Server components fetch and map; client components own form state and never query the DB directly.
- Errors are logged with a bracketed prefix and a generic message returned to the caller.

## Dependencies

### Internal
- `lib/supabase/server.ts` — the per-request client
- `lib/characters` — `rowToDraft`, `formToDraft`, `draftToPayload`, `draftToInsert`,
  `characterFormSchema`, `classifyUpdateError`, `computeXp`, `prepareImport`
- `lib/btcc` — `parseBtcc`, `emptyDraft`
- `components/characters/`, `components/layout/`

### External
- `next` (server actions, `redirect`, `revalidatePath`, `notFound`)
- `react-hook-form` + `@hookform/resolvers/zod` in the editor client

<!-- MANUAL: Notes added below this line are preserved on regeneration -->
