export type { Skill, Trait, Subskills } from "@/lib/validation/catalog";

/** Compose a desktop-style composite skill name, e.g. "Animal Handling/Riding". */
export function composeSkillName(parent: string, sub: string): string {
  return `${parent}/${sub}`;
}
