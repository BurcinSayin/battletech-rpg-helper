// XP math, faithful to the desktop reference app (read-only source of truth at
// ../Battletech-Character-Creator).
//
// The model is the desktop main window's (mainwindow.cpp:830-833):
//   xpProg    = Σ(attributes at FULL value) + Σ(skill xp) + Σ(trait xp)
//   remaining = xpMain - xpProg - wizardMod
// Attributes are charged at face value, NOT as the excess over their starting
// 100 (chardata.cpp:13-20), so an all-100 character consumes 800.
// `wizardMod` is persisted in `.btcc` as `gmxpmod` and is a term in the budget,
// not a display field; the desktop derives it as `XP - wz->chr_dat->xp` when the
// wizard finishes (mainwindow.cpp:397-401) and leaves it 0 for hand-built
// characters. RULES.md §2.2, §2.5.
// Negative skill/trait XP refund into the pool (e.g. trait:Unlucky=-50).
// The default budget is startXP = 5000 (chardata.cpp:7).
//
// Not this: stage 2's flex-XP dialog (s2flexxpdialog.cpp:106-109) subtracts
// spinbox values that are deltas added to the current attribute
// (s2flexxpdialog.cpp:115), so it charges only the increase. That is a
// per-dialog allowance, a different system from the character budget.

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

/** Each attribute's desktop starting value (chardata.cpp:13-20). Used as the
 *  fallback for an attribute absent from the draft — never as a discount. */
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

/** XP spent on attributes = Σ value over the 8 attributes. */
export function attributeXp(attrs: Record<string, number>): number {
  return ATTRIBUTE_KEYS.reduce((total, key) => {
    const value = attrs[key] ?? ATTRIBUTE_BASE;
    return total + value;
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
    remaining: budget - spent - draft.scalars.gmxpmod,
  };
}
