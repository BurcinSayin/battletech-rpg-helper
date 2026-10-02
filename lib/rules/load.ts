// Typed accessors over the generated rules JSON (`data/rules/`). These are
// static imports so the data is bundled and available offline (no DB, no fetch).
//
// Regenerate the JSON with: npm run rules:ingest
import skillsJson from "@/data/rules/skills.json";
import traitsJson from "@/data/rules/traits.json";
import subskillsJson from "@/data/rules/subskills.json";
import subtraitsJson from "@/data/rules/subtraits.json";
import affiliationsJson from "@/data/rules/affiliations.json";
import careersJson from "@/data/rules/careers.json";
import eyeColorsJson from "@/data/rules/eyeColors.json";
import hairColorsJson from "@/data/rules/hairColors.json";
import phenotypesJson from "@/data/rules/phenotypes.json";
import planetsJson from "@/data/rules/planets.json";
import modulesJson from "@/data/rules/modules.json";

import {
  stage0CatalogSchema,
  type Skill,
  type Trait,
  type Subskills,
  type Subtraits,
} from "@/lib/validation/catalog";
import type { Stage0Catalog } from "./stage0-contract";
import { composeSkillName, composeTraitName } from "./types";
import { parseChildhoodCatalog } from "@/lib/validation/childhood";
import type { ChildhoodCatalog } from "./childhood-contract";
import {
  adultModuleSchema,
  adultGateSchema,
  careerFieldsSchema,
} from "@/lib/validation/adult";

export const skills: Skill[] = skillsJson as unknown as Skill[];
export const traits: Trait[] = traitsJson;
export const subskills: Subskills = subskillsJson;
export const subtraits: Subtraits = subtraitsJson;
export const affiliations: string[] = affiliationsJson;
export const careers: string[] = careersJson;
export const eyeColors: string[] = eyeColorsJson;
export const hairColors: string[] = hairColorsJson;
export const phenotypes: string[] = phenotypesJson;
export const planets: string[] = planetsJson;
export const stage0Catalog: Stage0Catalog = stage0CatalogSchema.parse(
  modulesJson.stage0,
);
export const childhoodCatalog: ChildhoodCatalog = parseChildhoodCatalog(
  modulesJson.childhood,
  stage0Catalog,
);
export const adultModules = adultModuleSchema
  .array()
  .parse(modulesJson.modules.filter((entry) => entry.stage >= 3));
export const adultGates = adultGateSchema
  .array()
  .parse(modulesJson.gating.filter((entry) => entry.stage >= 3));
export const careerFields = careerFieldsSchema.parse(modulesJson.careerFields);

/** Expand subskills into composite names, e.g. "Gunnery/Aerospace". */
export function compositeSkillNames(): string[] {
  return Object.entries(subskills).flatMap(([parent, subs]) =>
    subs.map((sub) => composeSkillName(parent, sub)),
  );
}

const DYNAMIC_SKILL_ALIASES: Record<string, string> = {};
for (const s of skills) {
  if (s.alias_list) {
    for (const alias of s.alias_list) {
      DYNAMIC_SKILL_ALIASES[alias] = s.name;
    }
  }
  if (s.subskill_aliases) {
    for (const [canonicalSub, aliases] of Object.entries(s.subskill_aliases)) {
      if (!aliases) continue;
      for (const subAlias of aliases) {
        DYNAMIC_SKILL_ALIASES[`${s.name}/${subAlias}`] = `${s.name}/${canonicalSub}`;

        if (s.alias_list) {
          for (const parentAlias of s.alias_list) {
            DYNAMIC_SKILL_ALIASES[`${parentAlias}/${subAlias}`] = `${s.name}/${canonicalSub}`;
            DYNAMIC_SKILL_ALIASES[`${parentAlias}/${canonicalSub}`] = `${s.name}/${canonicalSub}`;
          }
        }
      }
    }
  }
}

/** Legacy / abbreviated desktop skill name aliases. */
export const SKILL_ALIASES: Record<string, string> = Object.assign(
  Object.create(null),
  {
    ...DYNAMIC_SKILL_ALIASES,
    "Gunnery/`Mech": "Gunnery/'Mech",
    "Piloting/`Mech": "Piloting/'Mech",
    "Gunnery/Mech": "Gunnery/'Mech",
    "Piloting/Mech": "Piloting/'Mech",
    "Technician/Jet": "Technician/Jets",
  },
);

const skillByName = new Map<string, Skill>(skills.map((s) => [s.name, s]));

/** Returns default subskill for a skill if defined in the rulebook, e.g. "General" for MedTech or Surgery. */
export function defaultSubskill(name: string): string | undefined {
  const trimmed = name.trim();
  const direct = skillByName.get(trimmed);
  if (direct?.default_sub) return direct.default_sub;
  const alias = SKILL_ALIASES[trimmed];
  if (typeof alias === "string") {
    const aliasedSkill = skillByName.get(alias);
    if (aliasedSkill?.default_sub) return aliasedSkill.default_sub;
  }
  return undefined;
}

/**
 * Resolve alias names, composite subskill aliases, and expand bare skills that have a default_sub
 * (e.g. "MedTech" -> "MedTech/General", "Medtech" -> "MedTech/General", "Surgery" -> "Surgery/General").
 */
export function resolveSkillName(name: string): string {
  const trimmed = name.trim();

  // 1. Direct alias check
  const exactAlias = SKILL_ALIASES[trimmed];
  const target = typeof exactAlias === "string" ? exactAlias : trimmed;

  // 2. If it contains a slash, resolve the parent portion's alias
  const slashIdx = target.indexOf("/");
  if (slashIdx !== -1) {
    const parent = target.slice(0, slashIdx);
    const sub = target.slice(slashIdx + 1);
    const parentAlias = SKILL_ALIASES[parent];
    const canonicalParent = typeof parentAlias === "string" ? parentAlias : parent;

    const parentSkill = skillByName.get(canonicalParent);
    if (parentSkill?.subskill_aliases) {
      for (const [canonicalSub, aliases] of Object.entries(parentSkill.subskill_aliases)) {
        if (aliases.includes(sub)) {
          return `${canonicalParent}/${canonicalSub}`;
        }
      }
    }

    return `${canonicalParent}/${sub}`;
  }

  // 3. Bare skill name: if it has a default subskill, assume `${canonical}/${default_sub}`
  const defSub = defaultSubskill(target);
  if (defSub) {
    const canonical = typeof exactAlias === "string" ? exactAlias : (skillByName.get(target)?.name ?? target);
    return `${canonical}/${defSub}`;
  }

  return target;
}

/**
 * Find a canonical skill definition.
 * Resolves aliases, and for composite subskills (e.g. "Gunnery/'Mech" or "Interests/BattleMechs"),
 * falls back to the parent skill definition ("Gunnery" or "Interest").
 */
export function findSkill(name: string): Skill | undefined {
  const trimmed = name.trim();
  const direct = skillByName.get(trimmed);
  if (direct) return direct;

  const resolved = resolveSkillName(trimmed);
  const resolvedDirect = skillByName.get(resolved);
  if (resolvedDirect) return resolvedDirect;

  const slashIdx = resolved.indexOf("/");
  if (slashIdx !== -1) {
    const parentName = resolved.slice(0, slashIdx);
    return skillByName.get(parentName);
  }

  return undefined;
}

/** Get tiered skills from the catalog. */
export function tieredSkills(): Skill[] {
  return skills.filter((s) => s.tiered);
}

/** Expand subtraits into composite names, e.g. "Compulsion/Berserker". */
export function compositeTraitNames(): string[] {
  return Object.entries(subtraits).flatMap(([parent, subs]) =>
    subs.map((sub) => composeTraitName(parent, sub)),
  );
}

/** Legacy / abbreviated desktop trait name aliases. */
export const TRAIT_ALIASES: Record<string, string> = Object.assign(
  Object.create(null),
  {
    Dependent: "Dependents",
    "Except Attribute": "Exceptional Attribute",
    TDS: "TDS — Transit Disorientation Syndrome",
    "Transit Disorientation Syndrome": "TDS — Transit Disorientation Syndrome",
    Vehicle: "Vehicle Level",
    "Compulsion/Paranoid": "Compulsion/Paranoia",
    Citizenship: "Citizenship/Trueborn",
    Implant: "Implant/Prosthetic",
    Title: "Title/Bloodname",
  },
);

/** Canonical opposing trait pairs in A Time of War. */
export const OPPOSING_TRAITS: Record<string, string> = {
  "Animal Antipathy": "Animal Empathy",
  "Animal Empathy": "Animal Antipathy",
  Attractive: "Unattractive",
  Unattractive: "Attractive",
  "Combat Paralysis": "Combat Sense",
  "Combat Sense": "Combat Paralysis",
  "Fast Learner": "Slow Learner",
  "Slow Learner": "Fast Learner",
  Fit: "Handicap",
  Handicap: "Fit",
  "Glass Jaw": "Toughness",
  Toughness: "Glass Jaw",
  "Good Hearing": "Poor Hearing",
  "Poor Hearing": "Good Hearing",
  "Good Vision": "Poor Vision",
  "Poor Vision": "Good Vision",
  Gregarious: "Introvert",
  Introvert: "Gregarious",
  Gremlins: "Tech Empathy",
  "Tech Empathy": "Gremlins",
  Impatient: "Patient",
  Patient: "Impatient",
  "Thick-Skinned": "Thin-Skinned",
  "Thin-Skinned": "Thick-Skinned",
};

const traitByName = new Map<string, Trait>(traits.map((t) => [t.name, t]));

/** Resolve alias names and sub-trait prefixes to a canonical name. */
export function resolveTraitName(name: string): string {
  const trimmed = name.trim();
  const alias = TRAIT_ALIASES[trimmed];
  return typeof alias === "string" ? alias : trimmed;
}

/**
 * Find a canonical trait definition.
 * Resolves aliases, and for composite sub-traits (e.g. "Compulsion/Berserker"),
 * falls back to the parent trait definition ("Compulsion").
 */
export function findTrait(name: string): Trait | undefined {
  const resolved = resolveTraitName(name);
  const direct = traitByName.get(resolved);
  if (direct) return direct;

  const slashIdx = resolved.indexOf("/");
  if (slashIdx !== -1) {
    const parentName = resolveTraitName(resolved.slice(0, slashIdx));
    return traitByName.get(parentName);
  }

  return undefined;
}

/** Get traits matching a category (e.g. "Character", "Vehicle", "Character (Identity)"). */
export function traitsByCategory(category: string): Trait[] {
  return traits.filter((t) => t.category === category || t.category.startsWith(category));
}

/** Get the opposing trait, if any. */
export function opposingTrait(name: string): Trait | undefined {
  const resolved = resolveTraitName(name);
  const baseName = resolved.split("/")[0];
  const opposedName = OPPOSING_TRAITS[baseName];
  return opposedName ? findTrait(opposedName) : undefined;
}
