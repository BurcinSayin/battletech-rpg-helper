export type { Skill, Trait, Subskills } from "@/lib/validation/catalog";
export type {
  Stage0Affiliation,
  Stage0Candidate,
  Stage0Catalog,
  Stage0Choice,
  Stage0ChoiceReference,
  Stage0Grant,
  Stage0Languages,
  Stage0Layer,
  Stage0Source,
  Stage0SubAffiliation,
} from "./stage0-contract";

/** Compose a desktop-style composite skill name, e.g. "Animal Handling/Riding". */
export function composeSkillName(parent: string, sub: string): string {
  return `${parent}/${sub}`;
}
