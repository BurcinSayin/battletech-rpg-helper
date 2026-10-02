import { findSkill } from "./load";

/** Resolve specialties through their parent; tiered skills advance at level 4. */
export function skillComplexity(
  name: string,
  level: number,
): string | undefined {
  const skill = findSkill(name);
  if (!skill) return undefined;

  if (skill.tiered && level >= 4 && skill.advanced) {
    return skill.advanced.category;
  }
  return skill.category;
}

export function skillTargetNumber(
  name: string,
  level: number,
): number | undefined {
  const skill = findSkill(name);
  if (!skill) return undefined;

  if (skill.tiered && level >= 4 && skill.advanced) {
    return skill.advanced.targetNumber;
  }
  return skill.targetNumber;
}
