import type { BtccDraft, BtccRow } from "@/lib/btcc";
import { careerFields } from "@/lib/rules/load";
import type { AdultModule } from "@/lib/validation/adult";
import type { AdultChoice, AdultChoiceSelection, AdultContext } from "./adult";
import { mergeRows } from "./grants";

/** S4FieldSkills (stage4_resurce.cpp:2616): expand Any fields, preserve
 * literal names (including Protocol/Affiliation) and deduplicate the pool. */
function fieldSkills(context: AdultContext): string[] {
  const s = context.draft.scalars;
  return [s.basicschool, s.advschool, s.specschool].flatMap((name) =>
    (
      careerFields.fields.find((field) => field.name === name)?.skills ?? []
    ).flatMap((skill) =>
      skill.includes("Any")
        ? careerFields.choices
            .filter((entry) => skill.includes(entry.match))
            .flatMap((entry) => entry.candidates)
        : [skill],
    ),
  );
}

/** S4AdvDialInit (s4advdial.cpp:257–395). Slots 5–7 allow repeated
 * selections, including the same candidate; zero repetitions still means
 * one ordinary dropdown. Unlabelled slots are disabled by the desktop. */
export function realLifeChoices(
  module: AdultModule,
  context: AdultContext,
): AdultChoice[] {
  return module.deferredPicks.flatMap((pick) => {
    if (!pick.label) return [];
    let names = pick.candidates ?? [];
    if (pick.candidatesSource?.includes("S4FieldSkills")) {
      names = fieldSkills(context);
      // stage4_resurce.cpp:2472–2484 appends the Clan fields as well.
      if (
        module.name === "Tour Of Duty" &&
        ["Invading Clan", "Homeworld Clan"].includes(context.draft.scalars.aff)
      )
        names = [...names, ...context.clanFields.map((row) => row.name)];
      names = [...new Set(names)].sort();
    }
    if (!names.length) return [];
    return Array.from(
      { length: Math.max(1, pick.repeats ?? 1) },
      (_, index) => ({
        id: `life-${pick.slot}-${index}`,
        label: pick.label!,
        xp: pick.xp ?? 0,
        candidates: names.map((value) => ({ kind: pick.kind, value })),
      }),
    );
  });
}

/** The two bundled options have explicit handlers, not literal trait names
 * (s4advdial.cpp:397–498). Keep the source's Science/Any Interest spellings. */
function bundle(
  module: string,
  id: string,
  value: string,
): { skills?: BtccRow[]; traits: BtccRow[] } | null {
  if (module === "Scientist Caste Service" && id === "life-1-0") {
    if (value === "Fast Learner(+75 XP)&Combat Paralysis(-75 XP)")
      return {
        traits: [
          { name: "Fast Learner", xp: 75 },
          { name: "Combat Paralysis", xp: -75 },
        ],
      };
    if (value === "Natural Aptitude/Any Interest(+75 XP)")
      return { traits: [{ name: "Natural Aptitude/Any Interest", xp: 75 }] };
    if (value === "Science Skill(+75 XP)&Dark Secret(-75 XP)")
      return {
        skills: [{ name: "Science", xp: 75 }],
        traits: [{ name: "Dark Secret", xp: -75 }],
      };
  }
  if (module === "To Serve And Protect" && id === "life-2-0") {
    if (value === "Attractive(+50XP)&Handicap(-50XP)")
      return {
        traits: [
          { name: "Attractive", xp: 50 },
          { name: "Handicap", xp: -50 },
        ],
      };
    if (value === "Fit(+50XP) and Dependent(-50XP)")
      return {
        traits: [
          { name: "Fit", xp: 50 },
          { name: "Dependent", xp: -50 },
        ],
      };
  }
  return null;
}

/** Always replay onto the entering prefix. Removing/replacing a selection
 * therefore restores all three grant kinds, including existing negative rows,
 * without reproducing wizard.cpp:4161's assignment-of-negated-delta defect. */
export function applyRealLifeChoices(
  prefix: BtccDraft,
  module: AdultModule,
  choices: readonly AdultChoice[],
  selected: AdultChoiceSelection,
): BtccDraft {
  const attrs = { ...prefix.attrs };
  const skills: BtccRow[] = [];
  const traits: BtccRow[] = [];
  for (const choice of choices) {
    const candidate = selected[choice.id];
    if (!candidate) continue;
    const grants = bundle(module.name, choice.id, candidate.value);
    if (grants) {
      skills.push(...(grants.skills ?? []));
      traits.push(...grants.traits);
    } else if (candidate.kind === "attribute") {
      attrs[candidate.value] = (attrs[candidate.value] ?? 0) + choice.xp;
    } else {
      (candidate.kind === "skill" ? skills : traits).push({
        name: candidate.value,
        xp: choice.xp,
      });
    }
  }
  return {
    ...prefix,
    attrs,
    skills: mergeRows(prefix.skills, skills, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
    traits: mergeRows(prefix.traits, traits, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
  };
}
