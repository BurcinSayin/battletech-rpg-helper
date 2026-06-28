import {
  type BtccDraft,
  type BtccRow,
  NUMERIC_SCALAR_KEYS,
  SCALAR_KEYS,
} from "./types";

/** ASCII/code-point sort, matching Qt's QMap key ordering for `.btcc` output. */
function asciiSort(keys: string[]): string[] {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function emitRows(rows: BtccRow[], key: string): string {
  return rows.map((r) => `${key}:${r.name}=${r.xp}\n`).join("");
}

/**
 * Serialize a `BtccDraft` back to `.btcc` text — byte-compatible with the
 * desktop app so files reopen there.
 *
 * Emit order matches prepSaveFile (mainwindow.cpp): the 21 scalars (always, even
 * when empty) → attr (alphabetical) → skill → trait → equip → preattr
 * (alphabetical, positive only) → preskill → pretrait → equiploc (alphabetical,
 * non-empty only) → weapon → chrweapon → verbatim notes block. Output is UTF-8,
 * LF line endings, no BOM, with a single trailing newline.
 */
export function serializeBtcc(draft: BtccDraft): string {
  let out = "";

  // 1. Scalars, always all 21 in fixed order.
  for (const key of SCALAR_KEYS) {
    const raw = draft.scalars[key];
    const value = NUMERIC_SCALAR_KEYS.has(key) ? String(raw) : (raw as string);
    out += `${key}:${value}\n`;
  }

  // 2. attr (alphabetical).
  for (const k of asciiSort(Object.keys(draft.attrs))) {
    out += `attr:${k}=${draft.attrs[k]}\n`;
  }

  // 3. skill, 4. trait (insertion order).
  out += emitRows(draft.skills, "skill");
  out += emitRows(draft.traits, "trait");

  // 5. equip (raw, insertion order).
  for (const row of draft.equip) out += `equip:${row}\n`;

  // 6. preattr (alphabetical, positive values only — matches desktop `> 0`).
  for (const k of asciiSort(Object.keys(draft.preAttrs))) {
    if (draft.preAttrs[k] > 0) out += `preattr:${k}=${draft.preAttrs[k]}\n`;
  }

  // 7. preskill, 8. pretrait.
  out += emitRows(draft.preSkills, "preskill");
  out += emitRows(draft.preTraits, "pretrait");

  // 9. equiploc (alphabetical, non-empty only).
  for (const k of asciiSort(Object.keys(draft.equipLoc))) {
    if (draft.equipLoc[k] !== "") out += `equiploc:${k}=${draft.equipLoc[k]}\n`;
  }

  // 10. weapon (raw), 11. chrweapon.
  for (const row of draft.weapons) out += `weapon:${row}\n`;
  for (const name of draft.chrWeapons) out += `chrweapon:${name}\n`;

  // 12. Notes block, verbatim body.
  out += `<notes>\n${draft.notes}\n</notes>\n`;

  return out;
}
