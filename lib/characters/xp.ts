// XP math, faithful to the desktop reference app (read-only source of truth at
// ../Battletech-Character-Creator).
//
// The "free XP" formula in stage 2 (s2flexxpdialog.cpp:106-109) is:
//   spent = Σ(trait xp) + Σ(skill xp) + Σ(attribute spinbox increases)
// where each attribute starts at a free base of 100 (chardata.cpp:13-20) and the
// spinbox stores the increase above that base. Negative skill/trait XP refund into
// the pool (e.g. trait:Unlucky=-50). The default budget is startXP = 5000
// (chardata.cpp:7). `gmxpmod` is persisted but unused by the desktop math, so it is
// display-only and intentionally NOT folded into the budget here.

import type { BtccDraft, BtccRow } from "@/lib/btcc/types";

/** The 8 fixed attributes, in desktop display order. */
export const ATTRIBUTE_KEYS = [
  "STR",
  "BOD",
  "RFL",
  "DEX",
  "INT",
  "WIL",
  "CHA",
  "EDG",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** Each attribute's free starting value; only increases above it cost XP. */
export const ATTRIBUTE_BASE = 100;

/** Default A Time of War creation budget (desktop `startXP`). */
export const CHARACTER_START_XP = 5000;

export interface XpSummary {
  spent: number;
  byCategory: { attributes: number; skills: number; traits: number };
  budget: number;
  remaining: number;
}

/** Sum the xp column of a (name, xp) row list (negatives refund). */
export function sumRows(rows: BtccRow[]): number {
  return rows.reduce((total, row) => total + row.xp, 0);
}

/** XP spent on attributes = Σ max(0, value − 100) over the 8 attributes. */
export function attributeXp(attrs: Record<string, number>): number {
  return ATTRIBUTE_KEYS.reduce((total, key) => {
    const value = attrs[key] ?? ATTRIBUTE_BASE;
    return total + Math.max(0, value - ATTRIBUTE_BASE);
  }, 0);
}

/** Compute the spent / remaining XP summary for a character draft. */
export function computeXp(draft: BtccDraft): XpSummary {
  const attributes = attributeXp(draft.attrs);
  const skills = sumRows(draft.skills);
  const traits = sumRows(draft.traits);
  const spent = attributes + skills + traits;
  const budget = CHARACTER_START_XP;
  return {
    spent,
    byCategory: { attributes, skills, traits },
    budget,
    remaining: budget - spent,
  };
}
