// Typed accessors over the generated rules JSON (`data/rules/`). These are
// static imports so the data is bundled and available offline (no DB, no fetch).
//
// Regenerate the JSON with: npm run rules:ingest
import skillsJson from "@/data/rules/skills.json";
import traitsJson from "@/data/rules/traits.json";
import subskillsJson from "@/data/rules/subskills.json";
import affiliationsJson from "@/data/rules/affiliations.json";
import careersJson from "@/data/rules/careers.json";
import eyeColorsJson from "@/data/rules/eyeColors.json";
import hairColorsJson from "@/data/rules/hairColors.json";
import phenotypesJson from "@/data/rules/phenotypes.json";
import planetsJson from "@/data/rules/planets.json";

import type { Skill, Trait, Subskills } from "@/lib/validation/catalog";
import { composeSkillName } from "./types";

export const skills: Skill[] = skillsJson;
export const traits: Trait[] = traitsJson;
export const subskills: Subskills = subskillsJson;
export const affiliations: string[] = affiliationsJson;
export const careers: string[] = careersJson;
export const eyeColors: string[] = eyeColorsJson;
export const hairColors: string[] = hairColorsJson;
export const phenotypes: string[] = phenotypesJson;
export const planets: string[] = planetsJson;

/** Expand subskills into composite names, e.g. "Gunnery/Aerospace". */
export function compositeSkillNames(): string[] {
  return Object.entries(subskills).flatMap(([parent, subs]) =>
    subs.map((sub) => composeSkillName(parent, sub)),
  );
}
