import type { BtccRow } from "@/lib/btcc/types";
import type { SibkoPool } from "../rules/childhood-contract";

export type SibkoFieldSelection = {
  readonly groupId: string;
  readonly skill: string;
};

export type SibkoSelection = {
  readonly branch: string | null;
  readonly basic: readonly SibkoFieldSelection[];
  readonly advanced: readonly SibkoFieldSelection[];
};

export type SibkoFieldsResult =
  | {
      readonly status: "invalid";
      readonly reason: "group" | "skill" | "duplicate" | "budget";
    }
  | {
      readonly status: "complete";
      readonly basicSkills: readonly BtccRow[];
      readonly advancedSkills: readonly BtccRow[];
      readonly basicRemaining: number;
      readonly advancedRemaining: number;
      readonly rebateXp: number;
    };

function resolvePool(
  pool: SibkoPool,
  selections: readonly SibkoFieldSelection[],
):
  | {
      readonly status: "complete";
      readonly skills: readonly BtccRow[];
      readonly remaining: number;
    }
  | Extract<SibkoFieldsResult, { status: "invalid" }> {
  const groups = new Map(pool.groups.map((group) => [group.id, group]));
  const selectedGroups = new Map<string, string>();
  const selectedSkills = new Set<string>();
  for (const selection of selections) {
    const group = groups.get(selection.groupId);
    if (!group) return { status: "invalid", reason: "group" };
    if (!group.skills.includes(selection.skill))
      return { status: "invalid", reason: "skill" };
    if (
      selectedGroups.has(selection.groupId) ||
      selectedSkills.has(selection.skill)
    ) {
      return { status: "invalid", reason: "duplicate" };
    }
    selectedGroups.set(selection.groupId, selection.skill);
    selectedSkills.add(selection.skill);
  }
  const spent = selections.length * pool.stepXp;
  if (spent > pool.budgetXp) return { status: "invalid", reason: "budget" };
  // Catalog order, not click order, determines the handed-off skill rows.
  const skills: BtccRow[] = [];
  for (const group of pool.groups) {
    const skill = selectedGroups.get(group.id);
    if (skill !== undefined) skills.push({ name: skill, xp: pool.stepXp });
  }
  return { status: "complete", skills, remaining: pool.budgetXp - spent };
}

/** Pools are independent: their XP never transfers to each other or to flex. */
export function resolveSibkoFields(
  basic: SibkoPool,
  advanced: SibkoPool,
  selection: SibkoSelection,
): SibkoFieldsResult {
  const basicResult = resolvePool(basic, selection.basic);
  if (basicResult.status === "invalid") return basicResult;
  const advancedResult = resolvePool(advanced, selection.advanced);
  if (advancedResult.status === "invalid") return advancedResult;
  return {
    status: "complete",
    basicSkills: basicResult.skills,
    advancedSkills: advancedResult.skills,
    basicRemaining: basicResult.remaining,
    advancedRemaining: advancedResult.remaining,
    rebateXp:
      selection.basic.length * basic.rebateXp +
      selection.advanced.length * advanced.rebateXp,
  };
}
