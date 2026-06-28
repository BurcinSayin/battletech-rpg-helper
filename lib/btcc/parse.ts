import {
  type BtccDraft,
  type BtccScalars,
  NUMERIC_SCALAR_KEYS,
  emptyDraft,
} from "./types";

const NOTES_OPEN = "<notes>\n";
const NOTES_CLOSE = "\n</notes>";

const SCALAR_KEY_SET = new Set<keyof BtccScalars>([
  "name",
  "aff",
  "subaff",
  "clancaste",
  "earlychild",
  "latechild",
  "schoolname",
  "basicschool",
  "advschool",
  "specschool",
  "reallife",
  "phenotype",
  "nameplanet",
  "sex",
  "age",
  "haircolor",
  "eyecolor",
  "height",
  "weight",
  "gmxpmod",
  "cbillmod",
]);

/** Mirror Qt `QString::toInt()`: empty / non-numeric → 0. */
function toInt(value: string): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Split a `name=xp` value on the FIRST `=`. */
function splitRow(value: string): { name: string; xp: number } | null {
  const eq = value.indexOf("=");
  if (eq === -1) return null;
  return { name: value.slice(0, eq), xp: toInt(value.slice(eq + 1)) };
}

/** Split a `key=value` pair on the FIRST `=`. */
function splitPair(value: string): [string, string] | null {
  const eq = value.indexOf("=");
  if (eq === -1) return null;
  return [value.slice(0, eq), value.slice(eq + 1)];
}

/**
 * Parse `.btcc` text into a `BtccDraft`.
 *
 * The notes block is captured verbatim (the exact substring between the opening
 * `<notes>\n` and the final `\n</notes>`), which — unlike the desktop's
 * line-by-line re-append — lets `serializeBtcc` reproduce it byte-for-byte.
 * Unknown keys are ignored (forward-compatible, matching the desktop loader).
 */
export function parseBtcc(text: string): BtccDraft {
  // Normalize: strip BOM, collapse CRLF / lone CR to LF.
  let normalized = text.replace(/^﻿/, "");
  normalized = normalized.replace(/\r\n?/g, "\n");

  const draft = emptyDraft();

  // Carve off the notes block first so its body is never line-processed.
  let lineSection = normalized;
  const openPos = normalized.indexOf(NOTES_OPEN);
  if (openPos !== -1) {
    const bodyStart = openPos + NOTES_OPEN.length;
    const closePos = normalized.lastIndexOf(NOTES_CLOSE);
    if (closePos >= bodyStart) {
      draft.notes = normalized.slice(bodyStart, closePos);
    } else {
      // Unterminated block: take everything after the opener as notes.
      draft.notes = normalized.slice(bodyStart);
    }
    lineSection = normalized.slice(0, openPos);
  }

  for (const line of lineSection.split("\n")) {
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon);
    const value = line.slice(colon + 1);

    if (SCALAR_KEY_SET.has(key as keyof BtccScalars)) {
      const k = key as keyof BtccScalars;
      if (NUMERIC_SCALAR_KEYS.has(k)) {
        (draft.scalars[k] as number) = toInt(value);
      } else {
        (draft.scalars[k] as string) = value;
      }
      continue;
    }

    switch (key) {
      case "attr": {
        const pair = splitPair(value);
        if (pair) draft.attrs[pair[0]] = toInt(pair[1]);
        break;
      }
      case "preattr": {
        const pair = splitPair(value);
        if (pair) draft.preAttrs[pair[0]] = toInt(pair[1]);
        break;
      }
      case "equiploc": {
        const pair = splitPair(value);
        if (pair) draft.equipLoc[pair[0]] = pair[1];
        break;
      }
      case "skill": {
        const row = splitRow(value);
        if (row) draft.skills.push(row);
        break;
      }
      case "trait": {
        const row = splitRow(value);
        if (row) draft.traits.push(row);
        break;
      }
      case "preskill": {
        const row = splitRow(value);
        if (row) draft.preSkills.push(row);
        break;
      }
      case "pretrait": {
        const row = splitRow(value);
        if (row) draft.preTraits.push(row);
        break;
      }
      case "equip":
        draft.equip.push(value);
        break;
      case "weapon":
        draft.weapons.push(value);
        break;
      case "chrweapon":
        draft.chrWeapons.push(value);
        break;
      default:
        // Unknown key — ignore, like the desktop loader.
        break;
    }
  }

  return draft;
}
