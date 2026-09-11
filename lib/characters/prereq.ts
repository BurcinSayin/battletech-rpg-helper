// Prerequisite collection and checking mirror Wizard::PrereqStage and
// MainWindow::CheckPrereq (wizard.cpp:277-388; mainwindow.cpp:3295-3427).
// Attribute values are stored on the character's ×100 scale; skill and trait
// values are raw XP. Requirements from multiple stages are maxima, never sums.

import type { BtccDraft, BtccRow } from "@/lib/btcc";
import { mergeRows } from "./grants";
import { ATTRIBUTE_BASE } from "./xp";

export type PrerequisiteSet = {
  readonly attrs: Readonly<Record<string, number>>;
  readonly skills: readonly BtccRow[];
  readonly traits: readonly BtccRow[];
};

export type MergedPrerequisiteSet = {
  readonly attrs: Record<string, number>;
  readonly skills: BtccRow[];
  readonly traits: BtccRow[];
};

export type UnmetPrerequisite = {
  readonly kind: "attribute" | "skill" | "trait";
  readonly name: string;
  readonly required: number;
  readonly actual: number;
};

export type PrerequisiteReport = {
  readonly satisfied: boolean;
  readonly requirements: MergedPrerequisiteSet;
  readonly unmet: readonly UnmetPrerequisite[];
};

/** Max-merge stage requirements while retaining first insertion order. */
export function mergePrerequisites(
  stages: readonly PrerequisiteSet[],
): MergedPrerequisiteSet {
  const attrs: Record<string, number> = {};
  let skills: BtccRow[] = [];
  let traits: BtccRow[] = [];
  for (const stage of stages) {
    for (const [name, minimum] of Object.entries(stage.attrs)) {
      attrs[name] = Math.max(attrs[name] ?? 0, minimum);
    }
    skills = mergeRows(skills, stage.skills, Math.max);
    traits = mergeRows(traits, stage.traits, Math.max);
  }
  return { attrs, skills, traits };
}

function xpByName(rows: readonly BtccRow[]): ReadonlyMap<string, number> {
  return new Map(rows.map((row) => [row.name, row.xp]));
}

function hasAtLeast(
  rows: ReadonlyMap<string, number>,
  names: readonly string[],
  minimum: number,
): boolean {
  return names.some((name) => (rows.get(name) ?? 0) >= minimum);
}

/**
 * Report current shortfalls after merging every selected stage.
 *
 * Missing attributes use the desktop's 100-point starting value. Missing skills
 * and traits are unmet even for nonpositive requirements (reported as 0 XP),
 * matching CheckPrereq's presence checks at mainwindow.cpp:3337-3367. The three
 * module-specific alternative prerequisites are applied after collection.
 */
export function checkPrerequisites(
  draft: BtccDraft,
  stages: readonly PrerequisiteSet[],
): PrerequisiteReport {
  const requirements = mergePrerequisites(stages);
  const skillXp = xpByName(draft.skills);
  const traitXp = xpByName(draft.traits);
  let unmet: UnmetPrerequisite[] = [];

  for (const [name, required] of Object.entries(requirements.attrs)) {
    const actual = draft.attrs[name] ?? ATTRIBUTE_BASE;
    if (actual < required) {
      unmet.push({ kind: "attribute", name, required, actual });
    }
  }
  for (const { name, xp: required } of requirements.skills) {
    const actual = skillXp.get(name) ?? 0;
    if (!skillXp.has(name) || actual < required) {
      unmet.push({ kind: "skill", name, required, actual });
    }
  }
  for (const { name, xp: required } of requirements.traits) {
    const actual = traitXp.get(name) ?? 0;
    if (!traitXp.has(name) || actual < required) {
      unmet.push({ kind: "trait", name, required, actual });
    }
  }

  if (
    draft.scalars.earlychild === "Nobility" &&
    hasAtLeast(traitXp, ["Wealth", "Title", "Property"], 500)
  ) {
    unmet = unmet.filter((entry) => entry.kind !== "trait");
  } else if (
    draft.scalars.earlychild === "White Collar" &&
    hasAtLeast(traitXp, ["Wealth", "Property"], 300)
  ) {
    unmet = unmet.filter((entry) => entry.kind !== "trait");
  }

  if (
    draft.scalars.reallife === "Covert Operations" &&
    (hasAtLeast(traitXp, ["Connections"], 150) ||
      hasAtLeast(skillXp, ["Leadership"], 150))
  ) {
    unmet = unmet.filter(
      (entry) => entry.kind !== "skill" && entry.kind !== "trait",
    );
  }

  return { satisfied: unmet.length === 0, requirements, unmet };
}
