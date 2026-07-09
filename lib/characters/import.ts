// Guard + normalization for importing a parsed `.btcc` draft as a new character.
//
// `parseBtcc` is deliberately tolerant — it never throws and yields an
// (almost) empty draft for arbitrary text. Before we insert, we reject drafts
// that don't look like a character at all, and normalize `name` to satisfy the
// DB constraint `check (char_length(name) between 1 and 100)`.

import type { BtccDraft } from "@/lib/btcc/types";

/** Fallback name when the file has no `name:` (or only whitespace). */
export const IMPORT_FALLBACK_NAME = "Imported Character";

/** Max name length enforced by the `characters.name` DB check constraint. */
export const NAME_MAX_LENGTH = 100;

export type PrepareImportResult =
  | { ok: true; draft: BtccDraft }
  | { ok: false; reason: "empty" };

/**
 * Does this draft carry any character data? A parse of unrelated text produces a
 * draft with a blank name and no attrs/skills/traits — we treat that as "not a
 * character file" rather than importing an empty pilot.
 */
export function looksLikeCharacter(draft: BtccDraft): boolean {
  return (
    draft.scalars.name.trim() !== "" ||
    Object.keys(draft.attrs).length > 0 ||
    draft.skills.length > 0 ||
    draft.traits.length > 0
  );
}

/** Clamp a raw parsed name to the DB constraint, falling back when blank. */
export function normalizeImportName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return IMPORT_FALLBACK_NAME;
  return trimmed.slice(0, NAME_MAX_LENGTH);
}

/**
 * Validate a parsed draft for import and return a draft with a DB-safe name.
 * Returns `{ ok: false, reason: "empty" }` when the file doesn't look like a
 * character. Does not mutate the input.
 */
export function prepareImport(draft: BtccDraft): PrepareImportResult {
  if (!looksLikeCharacter(draft)) {
    return { ok: false, reason: "empty" };
  }
  return {
    ok: true,
    draft: {
      ...draft,
      scalars: { ...draft.scalars, name: normalizeImportName(draft.scalars.name) },
    },
  };
}
