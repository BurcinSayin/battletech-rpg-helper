import type { BtccDraft, BtccRow } from "@/lib/btcc";
import {
  adultModules,
  adultGates,
  childhoodCatalog,
  careerFields,
  subskills,
} from "@/lib/rules/load";
import { matchesCondition } from "@/lib/rules/condition";
import type {
  AdultModule,
  AdultEffects,
  AdultBranch,
} from "@/lib/validation/adult";
import type { Stage0Candidate } from "@/lib/rules/stage0-contract";
import { mergeRows } from "./grants";
import { mergePrerequisites } from "./prereq";
import { ATTRIBUTE_KEYS } from "./xp";

export type AdultContext = {
  readonly draft: BtccDraft;
  readonly startingLanguage: string;
  readonly militaryField: boolean;
  readonly clanFields: readonly BtccRow[];
};
export type AdultChoice = {
  readonly id: string;
  readonly label: string;
  readonly xp: number;
  readonly candidates: readonly Stage0Candidate[];
};
export type AdultChoiceSelection = Readonly<Record<string, Stage0Candidate>>;

function conditionContext(context: AdultContext, name = "") {
  const s = context.draft.scalars;
  const hasTrait = (names: string[]) =>
    context.draft.traits.some((row) => names.includes(row.name));
  // S4ClearModulesList's local chkPrerc guards (stage4_resurce.cpp:85–444).
  const excluded =
    name === "Comstar/WoB Service"
      ? [
          "Lost Limb",
          "Poor Hearing",
          "Poor Vision",
          "Transit Disorientation Syndrome",
        ]
      : name === "Combat Correspondent" || name === "Covert Operations"
        ? ["Combat Paralysis"]
        : name === "Travel" || name === "Merchant"
          ? ["Transit Disorientation Syndrome"]
          : name === "Protomech Pilot Training"
            ? [
                "Combat Paralysis",
                "Glass Jaw",
                "Lost Limb",
                "Poor Hearing",
                "Poor Vision",
                "Slow Learner",
              ]
            : [];
  return {
    affVar: s.aff,
    earlyVar: s.earlychild,
    lateVar: s.latechild,
    "s4AffName.first": s.aff,
    "s4SubAffName.first": s.subaff,
    "s4clanCastName.first": s.clancaste,
    "s4LateChildName.first": s.latechild,
    "s4SchoolName.first": s.schoolname,
    "s4BasicSchool.first": s.basicschool,
    "s4AdvSchool.first": s.advschool,
    "s4SpecSchool.first": s.specschool,
    "s4BasicSchool.first.isEmpty()": !s.basicschool,
    "clanFieldSkills.isEmpty()": context.clanFields.length === 0,
    s4Phenotype: s.phenotype,
    s4MilField: context.militaryField,
    s4ComChk: s.aff === "ComStar",
    s4WobChk: s.aff === "Word of Blake",
    chkPrerc:
      hasTrait(excluded) ||
      (name === "Protomech Pilot Training" &&
        !hasTrait(["Implant/EI Neural Implant"])),
  };
}

/** Selection gates use the entering prefix; prerequisites remain advisory. */
export function availableSchools(context: AdultContext): AdultModule[] {
  const s = context.draft.scalars;
  if (
    s.latechild === "Civilian Job" &&
    ["Federated Suns", "Cappelan Confederation"].includes(s.aff)
  )
    return [];
  if (
    s.subaff === "Marian Hegemony" &&
    !context.draft.traits.some((row) =>
      ["Citizenship/Inner Sphere", "Citizenship/Clan"].includes(row.name),
    )
  )
    return [];
  const gate = adultGates.find(
    (entry) => entry.kind === "schoolListGate" && entry.name === s.subaff,
  );
  return adultModules.filter(
    (entry) =>
      entry.kind === "school" &&
      (gate ? gate.schools?.includes(entry.name) : entry.inDefaultSchoolList),
  );
}

export function availableRealLife(
  context: AdultContext,
  committed: readonly string[],
): AdultModule[] {
  const s = context.draft.scalars;
  if (
    s.latechild === "Civilian Job" &&
    ["Federated Suns", "Cappelan Confederation"].includes(s.aff)
  )
    return [];
  return adultModules.filter(
    (entry) =>
      entry.stage === 4 &&
      entry.name !== "None" &&
      !committed.includes(entry.name) &&
      ((entry.name === "Solaris VII Games" &&
        committed.includes("Tour Of Duty")) ||
        adultGates.some(
          (gate) =>
            gate.kind === "listGate" &&
            gate.name === entry.name &&
            (!gate.condition ||
              matchesCondition(
                gate.condition,
                conditionContext(context, entry.name),
              )),
        )),
  );
}

export function resolveAdultModule(
  entry: AdultModule,
  context: AdultContext,
): AdultModule {
  let result = { ...entry };
  function apply(effect: AdultEffects) {
    result = {
      ...result,
      xpCost: effect.xpCost ?? result.xpCost,
      flexXp: (effect.flexXp ?? result.flexXp ?? 0) + (effect.flexXpDelta ?? 0),
      attrDeltas: { ...result.attrDeltas, ...effect.attrDeltas },
      skillGrants: [...result.skillGrants, ...(effect.skillGrants ?? [])],
      traitGrants: [...result.traitGrants, ...(effect.traitGrants ?? [])],
      parametrizedGrants: {
        ...result.parametrizedGrants,
        ...effect.parametrizedGrants,
      },
      prerequisites: mergePrerequisites([
        result.prerequisites,
        ...(effect.prerequisites ? [effect.prerequisites] : []),
      ]),
    };
    if (effect.fields && result.fields) {
      const fields = { ...result.fields };
      for (const tier of ["basic", "advanced", "specialist"] as const) {
        const overlay = effect.fields[tier];
        if (overlay)
          fields[tier] = {
            skills: overlay.skills,
            age: overlay.age ?? fields[tier]?.age ?? 0,
          };
      }
      result = { ...result, fields };
    }
  }
  function branches(entries: readonly AdultBranch[]) {
    for (const branch of entries) {
      if (matchesCondition(branch.condition, conditionContext(context))) {
        apply(branch.effects);
        branches(branch.conditionals ?? []);
      } else if (branch.elseEffects) apply(branch.elseEffects);
    }
  }
  branches(entry.conditionals);
  if (entry.attributeWrites) {
    // University assigns conditional WIL/EDG before overwriting them in its
    // baseline (stage3_resurce.cpp:182–203). Reversing the two maps is also
    // wrong for later conditional writes, so replay the source order instead.
    const attrDeltas: Record<string, number> = {};
    const variables = conditionContext(context);
    for (const write of entry.attributeWrites) {
      if (
        !write.conditions.every((condition) =>
          matchesCondition(condition, variables),
        )
      )
        continue;
      attrDeltas[write.key] =
        write.operation === "add"
          ? (attrDeltas[write.key] ?? 0) + write.xp
          : write.xp;
    }
    result = { ...result, attrDeltas };
  }
  return result;
}

/** Stage 3 reuses S2AdvDialog: slot 4 is an attribute, Equipped/Vehicle are traits. */
export function schoolChoices(module: AdultModule): AdultChoice[] {
  return module.deferredPicks.flatMap((pick) => {
    const candidates = (pick.candidates ?? []).flatMap(
      (value): Stage0Candidate[] => {
        if (ATTRIBUTE_KEYS.some((key) => key === value))
          return [{ kind: "attribute", value }];
        if (value === "Equipped" || value === "Vehicle")
          return [{ kind: "trait", value }];
        const family = value.replace(/\/$/, "");
        return (
          subskills[family]?.map((sub) => `${family}/${sub}`) ?? [value]
        ).map((value) => ({ kind: "skill", value }));
      },
    );
    return Array.from({ length: pick.repeats ?? 1 }, (_, index) => ({
      id: `school-${pick.slot}-${index}`,
      label: pick.label ?? "School choice",
      xp: pick.xp ?? 0,
      candidates,
    }));
  });
}

export function fieldChoices(
  name: string,
  context: AdultContext,
): AdultChoice[] {
  const field = careerFields.fields.find((entry) => entry.name === name);
  if (!field) throw new Error(`Unknown career field: ${name}`);
  const protocol = childhoodCatalog.affiliationSkills.find(
    (entry) => entry.affiliation === context.draft.scalars.aff,
  )?.protocol;
  return field.skills.map((skill, index) => {
    const options = careerFields.choices
      .filter((entry) => skill.includes(entry.match))
      .flatMap((entry) => entry.candidates);
    const candidates = options.length
      ? [...new Set(options)]
      : [skill === "Protocol/Affiliation" ? (protocol ?? skill) : skill];
    return {
      id: `field-${index}`,
      label: skill,
      xp: 30,
      candidates: candidates.map((value) => ({ kind: "skill", value })),
    };
  });
}

export function validAdultChoices(
  choices: readonly AdultChoice[],
  selected: AdultChoiceSelection,
): boolean {
  return Object.entries(selected).every(([id, value]) =>
    choices.some(
      (choice) =>
        choice.id === id &&
        choice.candidates.some(
          (candidate) =>
            candidate.kind === value.kind && candidate.value === value.value,
        ),
    ),
  );
}
export function completeAdultChoices(
  choices: readonly AdultChoice[],
  selected: AdultChoiceSelection,
): boolean {
  return (
    validAdultChoices(choices, selected) &&
    choices.every(
      (choice) => choice.candidates.length === 1 || selected[choice.id],
    )
  );
}

export function applyAdultModule(
  prefix: BtccDraft,
  module: AdultModule,
  context: AdultContext,
  choices: readonly AdultChoice[] = [],
  selected: AdultChoiceSelection = {},
): BtccDraft {
  const attrs = { ...prefix.attrs };
  for (const [key, value] of Object.entries(module.attrDeltas))
    attrs[key] = (attrs[key] ?? 0) + value;
  const skills = [...module.skillGrants];
  const traits = [...module.traitGrants];
  const affiliation = childhoodCatalog.affiliationSkills.find(
    (entry) => entry.affiliation === prefix.scalars.aff,
  );
  for (const [name, xp] of [
    [context.startingLanguage, module.parametrizedGrants.language],
    [affiliation?.protocol, module.parametrizedGrants.protocols],
    [affiliation?.streetwise, module.parametrizedGrants.streetwise],
  ] as const)
    if (name && xp) skills.push({ name, xp });
  for (const choice of choices) {
    const candidate =
      selected[choice.id] ??
      (choice.candidates.length === 1 ? choice.candidates[0] : null);
    if (!candidate) continue;
    if (candidate.kind === "attribute")
      attrs[candidate.value] = (attrs[candidate.value] ?? 0) + choice.xp;
    else
      (candidate.kind === "skill" ? skills : traits).push({
        name: candidate.value,
        xp: choice.xp,
      });
  }
  const prerequisites = mergePrerequisites([
    {
      attrs: prefix.preAttrs,
      skills: prefix.preSkills,
      traits: prefix.preTraits,
    },
    module.prerequisites,
  ]);
  return {
    ...prefix,
    attrs,
    skills: mergeRows(prefix.skills, skills, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
    traits: mergeRows(prefix.traits, traits, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
    preAttrs: prerequisites.attrs,
    preSkills: prerequisites.skills,
    preTraits: prerequisites.traits,
  };
}
