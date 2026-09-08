import { describe, expect, it } from "vitest";
import { emptyDraft, type BtccDraft } from "@/lib/btcc";
import { childhoodCatalog, stage0Catalog } from "@/lib/rules/load";
import type {
  ChildhoodCatalog,
  ChildhoodModule,
} from "@/lib/rules/childhood-contract";
import type { Stage0Candidate, Stage0Layer } from "@/lib/rules/stage0-contract";
import {
  applyChildhoodModule,
  availableChildhoodModules,
  resolveChildhoodModule,
  type ChildhoodContext,
  type ChildhoodSelection,
} from "./childhood";

function context(
  affiliationId = 7,
  subAffiliationId = 0,
  overrides: Partial<ChildhoodContext> = {},
): ChildhoodContext {
  const affiliation = stage0Catalog.affiliations.find(
    (entry) => entry.id === affiliationId,
  )!;
  const subAffiliation = affiliation.subAffiliations.find(
    (entry) => entry.id === subAffiliationId,
  )!;
  return {
    affiliation: affiliation.name,
    subAffiliationId,
    subAffiliation: subAffiliation.name,
    caste: null,
    startingLanguage: affiliation.startingLanguages.candidates[0],
    stage1Module: null,
    traits: [],
    ...overrides,
  };
}

function selection(
  moduleName: string,
  overrides: Partial<ChildhoodSelection> = {},
): ChildhoodSelection {
  return {
    moduleName,
    choices: [],
    phenotype: null,
    sibko: null,
    ...overrides,
  };
}

function fillChoices(
  stage: 1 | 2,
  selected: ChildhoodSelection,
  entering: ChildhoodContext,
  choose?: (
    id: string,
    candidates: readonly Stage0Candidate[],
  ) => Stage0Candidate,
): ChildhoodSelection {
  const result = resolveChildhoodModule(
    childhoodCatalog,
    stage,
    selected,
    entering,
  );
  if (result.status === "invalid" || result.module === null)
    throw new Error(`Cannot resolve ${selected.moduleName}`);
  return {
    ...selected,
    choices: result.module.layer.choices.map((choice) => ({
      choiceId: choice.id,
      candidates: Array.from(
        { length: choice.selectionCount },
        () => choose?.(choice.id, choice.candidates) ?? choice.candidates[0],
      ),
    })),
  };
}

function apply(
  stage: 1 | 2,
  selected: ChildhoodSelection,
  entering: ChildhoodContext,
  prefix: BtccDraft = emptyDraft(),
): BtccDraft {
  const result = resolveChildhoodModule(
    childhoodCatalog,
    stage,
    selected,
    entering,
  );
  if (result.status !== "complete")
    throw new Error(
      `${selected.moduleName}: ${result.status}/${result.reason}`,
    );
  return applyChildhoodModule(prefix, result.module, selected);
}

function names(stage: 1 | 2, entering: ChildhoodContext): string[] {
  return availableChildhoodModules(childhoodCatalog, stage, entering).map(
    (entry) => entry.name,
  );
}

const standardStage1 = [
  "Back Woods",
  "Blue Collar",
  "Farm",
  "Fugitives",
  "Nobility",
  "Slave",
  "Street",
  "War Orphan",
  "White Collar",
];

describe("childhood eligibility from generated gates", () => {
  it("inserts Mercenary childhood only for its child and preserves source order", () => {
    expect(names(1, context(12, 0))).toEqual(standardStage1);
    expect(names(1, context(12, 4))).toEqual([
      "Back Woods",
      "Blue Collar",
      "Born Mercenary Brat",
      ...standardStage1.slice(2),
    ]);
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        1,
        selection("Born Mercenary Brat"),
        context(12, 0),
      ),
    ).toEqual({ status: "invalid", reason: "availability" });
  });

  it("uses citizenship name presence, including zero and negative XP, for Marian restrictions", () => {
    expect(names(1, context(7, 3))).toEqual(["Slave"]);
    expect(names(2, context(7, 3))).not.toContain("Military School");
    expect(names(2, context(7, 3))).not.toContain("Preparatory School");
    for (const trait of [
      { name: "Citizenship/Inner Sphere", xp: 0 },
      { name: "Citizenship/Clan", xp: -50 },
    ]) {
      const entering = context(7, 3, { traits: [trait] });
      expect(names(1, entering)).toEqual(standardStage1);
      expect(names(2, entering)).toContain("Military School");
      expect(names(2, entering)).toContain("Preparatory School");
    }
  });

  it("requires a named Clan child for Creche without inventing a caste gate", () => {
    expect(names(1, context(9, 0))).not.toContain("Trueborn Creche");
    const clan = context(9, 1);
    expect(names(1, clan)).toEqual([
      "Back Woods",
      "Blue Collar",
      "Farm",
      "Fugitives",
      "Slave",
      "Street",
      "Trueborn Creche",
      "War Orphan",
      "White Collar",
    ]);
    expect(names(2, clan)).not.toContain("High School");
    expect(names(2, clan)).toContain("Clan Apprenticeship");
    expect(names(1, { ...clan, caste: "Warrior Caste" })).toEqual(
      names(1, { ...clan, caste: "Laborer Caste" }),
    );
    expect(names(2, { ...clan, caste: "Warrior Caste" })).toEqual(
      names(2, { ...clan, caste: "Laborer Caste" }),
    );
  });

  it("applies illiteracy and previous-stage filters across affiliations", () => {
    const ordinary = names(2, context());
    expect(ordinary).not.toContain("Clan Apprenticeship");
    expect(ordinary).not.toContain("Freeborn Sibko");
    expect(ordinary).not.toContain("Trueborn Sibko");
    const illiterate = context(7, 0, {
      traits: [{ name: "Illiterate", xp: 0 }],
    });
    expect(names(2, illiterate)).not.toContain("High School");
    expect(names(2, illiterate)).not.toContain("Preparatory School");
    expect(names(2, context(7, 0, { stage1Module: "Nobility" }))).not.toContain(
      "Adolescent Warfare",
    );
    expect(
      names(2, context(9, 1, { stage1Module: "Trueborn Creche" })),
    ).not.toContain("Adolescent Warfare");
    for (const stage1Module of ["Back Woods", "Fugitives"])
      expect(names(2, context(9, 1, { stage1Module }))).not.toContain(
        "Preparatory School",
      );
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        selection("High School"),
        illiterate,
      ),
    ).toEqual({ status: "invalid", reason: "availability" });
  });

  it("keeps JarnFolk restrictions even with citizenship and ignores Randis's invalid removal", () => {
    const jarnFolk = context(8, 4, {
      traits: [{ name: "Citizenship/Inner Sphere", xp: 100 }],
    });
    expect(names(1, jarnFolk)).not.toContain("White Collar");
    expect(names(2, jarnFolk)).not.toContain("Military School");
    expect(names(2, jarnFolk)).not.toContain("Preparatory School");
    const minor = stage0Catalog.affiliations.find((entry) => entry.id === 6)!;
    const randis = minor.subAffiliations.find(
      (entry) => entry.name === "Fiefdom of Randis",
    )!;
    expect(names(2, context(6, randis.id))).toEqual(names(2, context(6, 0)));
    expect(names(2, context(0))).toContain("Civilian Job");
    expect(names(2, context())).not.toContain("Civilian Job");
  });
});

describe("ordinary childhood packages", () => {
  it("returns resolved choices while incomplete, rejecting foreign values even alongside missing input", () => {
    const missing = resolveChildhoodModule(
      childhoodCatalog,
      1,
      selection("Blue Collar"),
      context(),
    );
    expect(missing.status).toBe("incomplete");
    if (missing.status !== "incomplete" || !missing.module)
      throw new Error("Expected displayable package");
    const choice = missing.module.layer.choices[0];
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        1,
        selection("Blue Collar", {
          choices: [
            {
              choiceId: choice.id,
              candidates: [{ kind: "skill", value: "Forged" }],
            },
          ],
        }),
        context(),
      ),
    ).toEqual({ status: "invalid", reason: "candidate" });
    const complete = fillChoices(1, selection("Blue Collar"), context());
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        1,
        { ...complete, choices: [...complete.choices, complete.choices[0]] },
        context(),
      ),
    ).toEqual({ status: "invalid", reason: "choice" });
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        1,
        {
          ...complete,
          choices: complete.choices.map((pick, index) =>
            index === 0
              ? {
                  ...pick,
                  candidates: [...pick.candidates, pick.candidates[0]],
                }
              : pick,
          ),
        },
        context(),
      ),
    ).toEqual({ status: "invalid", reason: "choiceCount" });
  });

  it("does not let forged ordinary choices hide behind a missing Sibko branch", () => {
    const entering = context(9, 1);
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        selection("Freeborn Sibko"),
        entering,
      ),
    ).toEqual({ status: "incomplete", reason: "branch", module: null });
    const forged = selection("Freeborn Sibko", {
      choices: [
        {
          choiceId: "main:1",
          candidates: [{ kind: "skill", value: "Small Arms" }],
        },
      ],
    });
    expect(
      resolveChildhoodModule(childhoodCatalog, 2, forged, entering),
    ).toEqual({ status: "invalid", reason: "choice" });
  });

  it("sums the same specialization across independent Stage 2 Farm positions", () => {
    const selected = fillChoices(2, selection("Farm"), context());
    const interest = selected.choices[0].candidates[0].value;
    expect(selected.choices[1].candidates[0].value).toBe(interest);
    expect(
      apply(2, selected, context()).skills.find((row) => row.name === interest)
        ?.xp,
    ).toBe(60);
  });

  it("requires Creche phenotype identity without applying phenotype catalog attributes", () => {
    const entering = context(9, 1);
    const unchosen = fillChoices(
      1,
      selection("Trueborn Creche"),
      entering,
      (_id, candidates) =>
        candidates.find(
          (candidate) =>
            candidate.kind === "attribute" && candidate.value === "STR",
        )!,
    );
    expect(
      resolveChildhoodModule(childhoodCatalog, 1, unchosen, entering),
    ).toMatchObject({ status: "incomplete", reason: "phenotype" });
    const prefix = emptyDraft();
    prefix.scalars.phenotype = "Inherited";
    prefix.scalars.age = 8;
    const aerospace = apply(
      1,
      { ...unchosen, phenotype: "Phenotype/Aerospace" },
      entering,
      prefix,
    );
    const elemental = apply(
      1,
      { ...unchosen, phenotype: "Phenotype/Elemental" },
      entering,
      prefix,
    );
    expect(elemental.attrs).toEqual(aerospace.attrs);
    expect(elemental.scalars.phenotype).toBe("Phenotype/Elemental");
    expect(elemental.scalars.age).toBe(8);
    expect(prefix.scalars.phenotype).toBe("Inherited");
    const street = fillChoices(1, selection("Street"), entering);
    expect(apply(1, street, entering, prefix).scalars.phenotype).toBe(
      "Inherited",
    );
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        1,
        { ...street, phenotype: "Phenotype/Elemental" },
        entering,
      ),
    ).toEqual({ status: "invalid", reason: "phenotype" });
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        selection("Back Woods", { phenotype: "Phenotype/Elemental" }),
        entering,
      ),
    ).toEqual({ status: "invalid", reason: "phenotype" });
  });

  it("adds Merchant grants to the apprenticeship baseline and max-merges prerequisites", () => {
    const entering = context(9, 1, { caste: "Merchant Caste" });
    const selected = fillChoices(
      2,
      selection("Clan Apprenticeship"),
      entering,
      (_id, candidates) =>
        candidates.find(
          (candidate) => candidate.value !== "Interests/Clan History",
        )!,
    );
    const prefix = emptyDraft();
    prefix.attrs.CHA = 100;
    prefix.preAttrs.CHA = 500;
    const draft = apply(2, selected, entering, prefix);
    expect(draft.skills.find((row) => row.name === "Administration")?.xp).toBe(
      85,
    );
    expect(
      draft.skills.find((row) => row.name === "Interests/Clan History")?.xp,
    ).toBe(30);
    expect(draft.attrs.CHA).toBe(130);
    expect(draft.preAttrs.CHA).toBe(500);
    expect(draft.skills.find((row) => row.name === "Appraisal")?.xp).toBe(40);
  });

  it("keeps all Technician advanced positions and rejects caste-obsolete choices", () => {
    const entering = context(9, 1, { caste: "Technician Caste" });
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        selection("Clan Apprenticeship"),
        { ...entering, caste: null },
      ),
    ).toEqual({ status: "incomplete", reason: "context", module: null });
    const selected = fillChoices(
      2,
      selection("Clan Apprenticeship"),
      entering,
      (_id, candidates) =>
        candidates.find(
          (candidate) => candidate.value === "Computers/Programing",
        ) ?? candidates[0],
    );
    const technician = selected.choices.find(
      (choice) => choice.choiceId === "advanced:1",
    )!.candidates[0].value;
    const draft = apply(2, selected, entering);
    expect(draft.skills.find((row) => row.name === technician)?.xp).toBe(60);
    expect(
      draft.skills.find((row) => row.name === "Computers/Programing")?.xp,
    ).toBe(80);
    expect(draft.preAttrs.DEX).toBe(400);
    expect(
      resolveChildhoodModule(childhoodCatalog, 2, selected, {
        ...entering,
        caste: "Merchant Caste",
      }),
    ).toEqual({ status: "invalid", reason: "choice" });
    const other = { ...entering, caste: "Warrior Caste" };
    const baseline = apply(
      2,
      fillChoices(2, selection("Clan Apprenticeship"), other),
      other,
    );
    expect(
      baseline.skills.find((row) => row.name === "Administration")?.xp,
    ).toBe(35);
    expect(baseline.attrs.DEX).toBeUndefined();
  });

  it("sets absolute Stage 2 ages without changing the retained prefix on replay", () => {
    const prefix = emptyDraft();
    prefix.scalars.age = 11;
    prefix.scalars.phenotype = "Phenotype/Elemental";
    const backWoods = apply(2, selection("Back Woods"), context(), prefix);
    expect(backWoods.scalars).toMatchObject({
      age: 16,
      latechild: "Back Woods",
      phenotype: "Phenotype/Elemental",
    });
    const civilian = fillChoices(2, selection("Civilian Job"), context(0));
    expect(apply(2, civilian, context(0), prefix).scalars).toMatchObject({
      age: 18,
      latechild: "Civilian Job",
    });
    expect(apply(2, selection("Back Woods"), context(), prefix)).toEqual(
      backWoods,
    );
    expect(prefix.scalars).toMatchObject({
      age: 11,
      latechild: "",
      phenotype: "Phenotype/Elemental",
    });
  });
});

describe("ordered signed package application", () => {
  const source = { file: "domain-fixture", line: 1 };
  const baseLayer: Stage0Layer = {
    attrDeltas: { STR: -20, DEX: 10 },
    skillGrants: [
      { name: "First", xp: -10 },
      { name: "Uncatalogued/Any", xp: -15 },
      { name: "First", xp: 5 },
    ],
    traitGrants: [{ name: "Exceptional Attribute/", xp: -25 }],
    prerequisites: {
      attrs: { STR: 300 },
      skills: [{ name: "First", xp: 200 }],
      traits: [{ name: "Trait", xp: 100 }],
    },
    choices: [
      {
        id: "main:1",
        label: null,
        candidates: [{ kind: "skill", value: "First" }],
        xp: 5,
        selectionCount: 1,
        unique: false,
        candidateSelection: { mode: "all" },
        source,
      },
    ],
    source,
  };
  const moduleEntry: ChildhoodModule = {
    stage: 1,
    name: "Signed package",
    description: null,
    xpCost: 250,
    layer: baseLayer,
    parametrizedGrants: { language: -5, protocols: 10, streetwise: 15 },
    phenotypes: [],
    casteLayers: [],
    flexPolicy: null,
    sibkoBranches: [],
    source,
  };
  const catalog: ChildhoodCatalog = {
    modules: [moduleEntry],
    gates: [],
    affiliationSkills: [
      {
        affiliation: "Affiliation",
        protocol: "Protocol/Exact",
        streetwise: "Streetwise/Exact",
        source,
      },
    ],
  };
  const entering: ChildhoodContext = {
    affiliation: "Affiliation",
    subAffiliationId: 0,
    subAffiliation: "None",
    caste: null,
    startingLanguage: "Language/Exact",
    stage1Module: null,
    traits: [],
  };
  const selected = selection("Signed package", {
    choices: [
      { choiceId: "main:1", candidates: [{ kind: "skill", value: "First" }] },
    ],
  });

  it("retains insertion order through zero, exact parameter names, negatives and prerequisite maxima", () => {
    const resolved = resolveChildhoodModule(catalog, 1, selected, entering);
    if (resolved.status !== "complete") throw new Error("Expected package");
    const prefix = emptyDraft();
    prefix.attrs.STR = 100;
    prefix.skills = [
      { name: "First", xp: 10 },
      { name: "Second", xp: 20 },
      { name: "Language/Exact", xp: 5 },
    ];
    prefix.preAttrs.STR = 400;
    prefix.preSkills = [{ name: "First", xp: 300 }];
    prefix.preTraits = [{ name: "Trait", xp: 50 }];
    const draft = applyChildhoodModule(prefix, resolved.module, selected);
    expect(draft.attrs.STR).toBe(80);
    expect(draft.skills).toEqual([
      { name: "First", xp: 10 },
      { name: "Second", xp: 20 },
      { name: "Uncatalogued/Any", xp: -15 },
      { name: "Protocol/Exact", xp: 10 },
      { name: "Streetwise/Exact", xp: 15 },
    ]);
    expect(draft.traits).toEqual([{ name: "Exceptional Attribute/", xp: -25 }]);
    expect(draft.preAttrs.STR).toBe(400);
    expect(draft.preSkills).toEqual([{ name: "First", xp: 300 }]);
    expect(draft.preTraits).toEqual([{ name: "Trait", xp: 100 }]);
    expect(prefix.skills).toEqual([
      { name: "First", xp: 10 },
      { name: "Second", xp: 20 },
      { name: "Language/Exact", xp: 5 },
    ]);
  });

  it("requires parameter context and replaces conditional module-local attribute assignments", () => {
    expect(
      resolveChildhoodModule(catalog, 1, selected, {
        ...entering,
        startingLanguage: "",
      }),
    ).toEqual({ status: "incomplete", reason: "context", module: null });
    expect(
      resolveChildhoodModule(catalog, 1, selected, {
        ...entering,
        affiliation: "Forged",
      }),
    ).toEqual({ status: "invalid", reason: "context" });
    const overlay: Stage0Layer = {
      ...baseLayer,
      attrDeltas: { DEX: 30 },
      skillGrants: [],
      traitGrants: [],
      choices: [],
      prerequisites: { attrs: {}, skills: [], traits: [] },
    };
    const casted: ChildhoodCatalog = {
      ...catalog,
      modules: [
        {
          ...moduleEntry,
          casteLayers: [{ caste: "Exact Caste", layer: overlay }],
        },
      ],
    };
    const result = resolveChildhoodModule(casted, 1, selected, {
      ...entering,
      caste: "Exact Caste",
    });
    if (result.status !== "complete") throw new Error("Expected package");
    const prefix = emptyDraft();
    prefix.attrs.DEX = 100;
    expect(
      applyChildhoodModule(prefix, result.module, selected).attrs.DEX,
    ).toBe(130);
  });

  it("allows genuine branch-specific choices while branch identity is still incomplete", () => {
    const freeborn = childhoodCatalog.modules.find(
      (entry) => entry.stage === 2 && entry.name === "Freeborn Sibko",
    )!;
    const possibleBranch = freeborn.sibkoBranches[0];
    const branched: ChildhoodCatalog = {
      ...catalog,
      modules: [
        {
          ...freeborn,
          sibkoBranches: [
            {
              ...possibleBranch,
              clans: null,
              layer: { ...possibleBranch.layer, choices: baseLayer.choices },
            },
          ],
        },
      ],
    };
    const unbranched = selection("Freeborn Sibko", {
      choices: selected.choices,
    });
    expect(resolveChildhoodModule(branched, 2, unbranched, entering)).toEqual({
      status: "incomplete",
      reason: "branch",
      module: null,
    });
    const complete = {
      ...unbranched,
      sibko: { branch: possibleBranch.name, basic: [], advanced: [] },
    };
    expect(resolveChildhoodModule(branched, 2, complete, entering).status).toBe(
      "complete",
    );
    expect(
      resolveChildhoodModule(
        branched,
        2,
        {
          ...unbranched,
          choices: [
            {
              choiceId: "main:1",
              candidates: [{ kind: "skill", value: "Forged" }],
            },
          ],
        },
        entering,
      ),
    ).toEqual({ status: "invalid", reason: "candidate" });
  });
});
