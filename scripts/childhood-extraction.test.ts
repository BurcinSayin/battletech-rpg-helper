import { describe, expect, it } from "vitest";
import { emptyDraft } from "../lib/btcc";
import type { BtccDraft } from "../lib/btcc";
import type { Stage0Candidate } from "../lib/rules/stage0-contract";
import {
  applyChildhoodModule,
  availableChildhoodModules,
  resolveChildhoodModule,
} from "../lib/characters/childhood";
import type {
  ChildhoodContext,
  ChildhoodSelection,
} from "../lib/characters/childhood";
import { buildModulesFile } from "./extract-rules";
import { interpretBlock, parseDispatchFunction } from "./extract-rules-lib";

const file = buildModulesFile();
const catalog = file.childhood;
function context(
  affiliationId = 7,
  subAffiliationId = 0,
  stage1Module: string | null = null,
): ChildhoodContext {
  const aff = file.stage0.affiliations.find(({ id }) => id === affiliationId)!;
  const sub = aff.subAffiliations.find(({ id }) => id === subAffiliationId)!;
  return {
    affiliation: aff.name,
    subAffiliationId,
    subAffiliation: sub.name,
    startingLanguage: "Language/English",
    caste: null,
    stage1Module,
    traits: [],
  };
}
function complete(
  stage: 1 | 2,
  name: string,
  entering = context(),
  choose?: (
    id: string,
    candidates: readonly Stage0Candidate[],
  ) => Stage0Candidate,
): { draft: BtccDraft; selected: ChildhoodSelection } {
  const initial: ChildhoodSelection = {
    moduleName: name,
    choices: [],
    phenotype: name === "Trueborn Creche" ? "Phenotype/Elemental" : null,
    sibko: null,
  };
  const partial = resolveChildhoodModule(catalog, stage, initial, entering);
  if (partial.status === "invalid" || !partial.module)
    throw new Error(`Cannot resolve ${name}`);
  const selected = {
    ...initial,
    choices: partial.module.layer.choices.map((choice) => ({
      choiceId: choice.id,
      candidates: Array.from({ length: choice.selectionCount }, () =>
        choose ? choose(choice.id, choice.candidates) : choice.candidates[0],
      ),
    })),
  };
  const resolved = resolveChildhoodModule(catalog, stage, selected, entering);
  if (resolved.status !== "complete")
    throw new Error(`Cannot complete ${name}`);
  return {
    draft: applyChildhoodModule(emptyDraft(), resolved.module, selected),
    selected,
  };
}
function skill(draft: BtccDraft, name: string): number {
  return draft.skills.find((row) => row.name === name)?.xp ?? 0;
}
function packageXp(draft: BtccDraft): number {
  return (
    Object.values(draft.attrs).reduce((sum, xp) => sum + xp, 0) +
    [...draft.skills, ...draft.traits].reduce((sum, row) => sum + row.xp, 0)
  );
}

describe("source childhood packages through real resolution", () => {
  it("retains all main and advanced Mercenary Brat positions and grants two languages as 30+20", () => {
    const { selected, draft } = complete(
      2,
      "Mercenary Brat",
      context(),
      (id, candidates) =>
        id.startsWith("main:2:")
          ? candidates.find(({ value }) => value === "Language/German")!
          : candidates[0],
    );
    expect(selected.choices.map(({ choiceId }) => choiceId)).toEqual([
      "main:1",
      "main:2:1",
      "main:2:2",
      "main:3",
      "advanced:1",
      "advanced:2",
      "advanced:3",
    ]);
    expect(skill(draft, "Language/German")).toBe(50);
    const tactic = selected.choices.find(
      ({ choiceId }) => choiceId === "advanced:1",
    )!.candidates[0].value;
    const technician = selected.choices.find(
      ({ choiceId }) => choiceId === "advanced:2",
    )!.candidates[0].value;
    expect(skill(draft, tactic)).toBe(10);
    expect(skill(draft, technician)).toBe(30);
  });

  it("owns Farm repetition by module rather than affiliation-filtered dropdown position", () => {
    for (const entering of [context(7), context(9, 1)]) {
      const { selected, draft } = complete(1, "Farm", entering);
      const interest = selected.choices.find(
        ({ choiceId }) => choiceId === "main:1",
      )!;
      expect(interest.candidates).toHaveLength(2);
      expect(skill(draft, interest.candidates[0].value)).toBe(10);
    }
    const blue = complete(1, "Blue Collar");
    const interest = blue.selected.choices.find(
      ({ choiceId }) => choiceId === "main:2",
    )!;
    expect(skill(blue.draft, interest.candidates[0].value)).toBe(10);
  });

  it("preserves Born Mercenary Brat's +270 worked package without accidental second Language", () => {
    const { draft, selected } = complete(
      1,
      "Born Mercenary Brat",
      context(12, 4),
      (id, candidates) =>
        candidates.find(
          ({ value }) =>
            value ===
            (id === "main:1" ? "Language/German" : "Streetwise/FedSuns"),
        )!,
    );
    expect(selected.choices.map(({ candidates }) => candidates.length)).toEqual(
      [1, 1],
    );
    expect(skill(draft, "Language/German")).toBe(10);
    expect(skill(draft, "Streetwise/FedSuns")).toBe(10);
    expect(packageXp(draft)).toBe(270);
  });

  it("dispatches Creche's mixed main slot into the declared bucket before deduplication", () => {
    const ruleModule = catalog.modules.find(
      (entry) => entry.stage === 1 && entry.name === "Trueborn Creche",
    )!;
    const mixed = ruleModule.layer.choices.find(({ id }) => id === "main:4")!;
    for (const kind of ["attribute", "trait", "skill"] as const) {
      const candidate = mixed.candidates.find((entry) => entry.kind === kind)!;
      const { draft } = complete(
        1,
        ruleModule.name,
        context(9, 1),
        (id, candidates) => (id === "main:4" ? candidate : candidates[0]),
      );
      const fixed =
        kind === "attribute"
          ? (ruleModule.layer.attrDeltas[candidate.value] ?? 0)
          : (kind === "skill"
              ? ruleModule.layer.skillGrants
              : ruleModule.layer.traitGrants
            )
              .filter(({ name }) => name === candidate.value)
              .reduce((sum, row) => sum + row.xp, 0);
      const actual =
        kind === "attribute"
          ? draft.attrs[candidate.value]
          : (kind === "skill" ? draft.skills : draft.traits).find(
              ({ name }) => name === candidate.value,
            )?.xp;
      const more = kind === "attribute" && candidate.value === "STR" ? 60 : 0;
      expect(actual).toBe(fixed + 15 + more);
      expect(draft.scalars.phenotype).toBe("Phenotype/Elemental");
    }
  });

  it("keeps only High School and Spacer Family's final slot assignments, including literal Language/Any", () => {
    const school = complete(2, "High School");
    expect(school.selected.choices).toHaveLength(1);
    expect(
      skill(school.draft, school.selected.choices[0].candidates[0].value),
    ).toBe(35);
    const spacer = complete(2, "Spacer Family");
    expect(spacer.selected.choices).toHaveLength(1);
    expect(spacer.selected.choices[0].candidates[0].value).toMatch(
      /^Language\//,
    );
    expect(
      skill(spacer.draft, spacer.selected.choices[0].candidates[0].value),
    ).toBe(15);
    expect(skill(spacer.draft, "Language/Any")).toBe(15);
  });
});

describe("source filter and interpreter regressions", () => {
  it("retains all seven source clear filters and applies previous-stage restrictions globally", () => {
    const clear = file.gating.filter(
      (gate) => gate.function === "S2ClearListElem",
    );
    expect(
      clear.reduce(
        (sum, gate) =>
          sum +
          (gate.removed?.length ?? 0) +
          (gate.conditionedRemovals?.reduce(
            (count, row) => count + row.removed.length,
            0,
          ) ?? 0),
        0,
      ),
    ).toBe(7);
    const ordinary = availableChildhoodModules(catalog, 2, context()).map(
      ({ name }) => name,
    );
    expect(ordinary).not.toContain("Clan Apprenticeship");
    expect(ordinary).not.toContain("Trueborn Sibko");
    expect(ordinary).not.toContain("Freeborn Sibko");
    expect(
      availableChildhoodModules(
        catalog,
        2,
        context(9, 1, "Trueborn Creche"),
      ).map(({ name }) => name),
    ).not.toContain("Adolescent Warfare");
  });

  it("replaces within a namespace without overwriting the other namespace, including conditional picks", () => {
    const parsed = interpretBlock(
      [
        's2ChildHoodLabel1 = "Main";',
        's2ChildHoodAttr1 << "A";',
        "s2ChildHoodSkills1 = 40;",
        's2ChildHoodLabelAdv1 = "Advanced";',
        's2ChildHoodAttrAdv1 << "B";',
        "s2ChildHoodSkillsAdv1 = 10;",
        's2ChildHoodAttr1 = CreateSubSkillList("Interests");',
        "s2ChildHoodSkills1 = 35;",
        'if (casteName == "Scientist Caste") {',
        's2ChildHoodAttrAdv1 << "C";',
        "s2ChildHoodSkillsAdv1 = 20;",
        "}",
      ],
      2,
      { Interests: ["History"] },
    );
    expect(
      parsed.effects.picks?.map(({ namespace, xp, candidates }) => ({
        namespace,
        xp,
        candidates,
      })),
    ).toEqual([
      { namespace: "main", xp: 35, candidates: ["Interests/History"] },
      { namespace: "advanced", xp: 10, candidates: ["B"] },
    ]);
    expect(parsed.conditionals[0].effects.picks?.[0]).toMatchObject({
      namespace: "advanced",
      xp: 20,
      candidates: ["C"],
    });
  });

  it("fails loudly with source location when a live module statement is unknown", () => {
    expect(() =>
      parseDispatchFunction(
        () =>
          'void Stage1::Example() {\nif (nameChild == "Example") {\nunknownRule();\n}\n}',
        "changed.cpp",
        /Stage1::Example\(/,
        "nameChild",
        1,
        "module",
        {},
      ),
    ).toThrow(/changed\.cpp:\d+:.*Unrecognized statement/);
  });
});
