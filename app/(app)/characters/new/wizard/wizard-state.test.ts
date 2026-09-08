import { describe, it, expect } from "vitest";
import { stage0Catalog } from "@/lib/rules/load";
import { validateFlexAllocations } from "@/lib/characters";
import type { Stage0Candidate } from "@/lib/rules/stage0-contract";
import { resolveStage0Candidates } from "./wizard-stage0";
import type { Stage0LayerId, Stage0Selection } from "./wizard-stage0";
import {
  WIZARD_PAGES,
  canAdvance,
  initialWizardState,
  pageForStage,
  stageForPage,
  wizardReducer,
} from "./wizard-state";
import type { WizardAction, WizardDraftState } from "./wizard-state";

const empty: Stage0Selection = {
  affiliationId: null,
  subAffiliationId: null,
  casteId: null,
  startingLanguage: null,
  choices: [],
};
const major: readonly WizardAction[] = [
  { type: "setStage0Affiliation", affiliationId: 7 },
  { type: "setStage0SubAffiliation", subAffiliationId: 0 },
  { type: "setStage0StartingLanguage", startingLanguage: "Language/English" },
];
const clan = stage0Catalog.affiliations.find((entry) => entry.id === 9);
if (!clan) throw new TypeError("Missing Clan fixture");
const choiceCasteIndex = clan.castes.findIndex((name) =>
  stage0Catalog.castes.some(
    (entry) => entry.name === name && entry.layer.choices.length > 0,
  ),
);
function drive(
  actions: readonly WizardAction[],
  state = initialWizardState(),
): WizardDraftState {
  return actions.reduce(wizardReducer, state);
}
// Real catalog fixtures: select every position, respecting dependent candidate sets.
function path(
  affiliationId: number,
  subAffiliationId = 0,
  casteIndex = 0,
): readonly WizardAction[] {
  const affiliation = stage0Catalog.affiliations.find(
    (entry) => entry.id === affiliationId,
  );
  const child = affiliation?.subAffiliations.find(
    (entry) => entry.id === subAffiliationId,
  );
  if (!affiliation || !child) throw new TypeError("Missing catalog fixture");
  const casteId = affiliation.casteRequired
    ? (child.castes ?? affiliation.castes)[casteIndex]
    : null;
  const language = (child.startingLanguages ?? affiliation.startingLanguages)
    .candidates[0];
  if (casteId === undefined || !language)
    throw new TypeError("Incomplete catalog fixture");
  let selection: Stage0Selection = {
    ...empty,
    affiliationId,
    subAffiliationId,
    casteId,
    startingLanguage: language,
  };
  const actions: WizardAction[] = [
    { type: "setStage0Affiliation", affiliationId },
    { type: "setStage0SubAffiliation", subAffiliationId },
    ...(casteId === null
      ? []
      : [{ type: "setStage0Caste", casteId } satisfies WizardAction]),
    { type: "setStage0StartingLanguage", startingLanguage: language },
  ];
  const layers = [
    { id: "base", layer: affiliation.base },
    { id: "subAffiliation", layer: child.layer },
    {
      id: "caste",
      layer: stage0Catalog.castes.find((entry) => entry.name === casteId)
        ?.layer,
    },
  ] satisfies readonly {
    readonly id: Stage0LayerId;
    readonly layer: typeof affiliation.base | undefined;
  }[];
  for (const { id: layer, layer: data } of layers) {
    for (const choice of data?.choices ?? []) {
      const candidates = resolveStage0Candidates(
        choice,
        layer,
        selection,
      ).slice(0, choice.selectionCount);
      const pick = { layer, choiceId: choice.id, candidates };
      selection = { ...selection, choices: [...selection.choices, pick] };
      actions.push({ type: "setStage0Choice", ...pick });
    }
  }
  return actions;
}

const strength: Stage0Candidate = { kind: "attribute", value: "STR" };
const perception: Stage0Candidate = { kind: "skill", value: "Perception" };

function completeChoices(
  state: WizardDraftState,
  stage: "stage1" | "stage2",
): WizardDraftState {
  const resolution = state.childhood[stage].resolution;
  const ruleModule =
    resolution && resolution.status !== "invalid" ? resolution.module : null;
  if (!ruleModule) throw new TypeError("Expected resolved childhood package");
  return drive(
    ruleModule.layer.choices.map((choice): WizardAction => ({
      type: "setStageChoice",
      stage,
      choiceId: choice.id,
      candidates: Array.from(
        { length: choice.selectionCount },
        () =>
          choice.candidates.find(
            (candidate) =>
              candidate.kind === "attribute" && candidate.value === "STR",
          ) ?? choice.candidates[0],
      ),
    })),
    state,
  );
}

function completeStage1(
  state = drive([{ type: "next" }, ...major, { type: "next" }]),
  moduleName = "Street",
): WizardDraftState {
  return completeChoices(
    wizardReducer(state, {
      type: "setStageModule",
      stage: "stage1",
      moduleName,
    }),
    "stage1",
  );
}

function ordinaryStage2(): WizardDraftState {
  return drive(
    [
      { type: "next" },
      { type: "setStageModule", stage: "stage2", moduleName: "Back Woods" },
    ],
    completeStage1(),
  );
}

function clanStage2(): WizardDraftState {
  if (!clan) throw new TypeError("Missing Clan fixture");
  const ghostBear = clan.subAffiliations.find(
    (child) => child.name === "Ghost Bear",
  );
  if (!ghostBear) throw new TypeError("Missing Ghost Bear fixture");
  let state = drive([
    { type: "next" },
    ...path(9, ghostBear.id),
    { type: "next" },
  ]);
  state = completeStage1(state, "Trueborn Creche");
  return drive(
    [
      { type: "setStage1Phenotype", phenotype: "Phenotype/Elemental" },
      { type: "next" },
    ],
    state,
  );
}

function fillFields(state: WizardDraftState): WizardDraftState {
  const resolution = state.childhood.stage2.resolution;
  const pools =
    resolution?.status === "complete" ? resolution.module.sibkoPools : null;
  if (!pools) throw new TypeError("Expected resolved Sibko pools");
  return drive(
    (["basic", "advanced"] as const).flatMap((pool) =>
      pools[pool].groups.map((group): WizardAction => ({
        type: "setSibkoField",
        pool,
        groupId: group.id,
        skill: group.skills[0],
      })),
    ),
    state,
  );
}

function skillXp(state: WizardDraftState, name: string): number {
  return state.draft.skills.find((row) => row.name === name)?.xp ?? 0;
}

function flexBalance(state: WizardDraftState) {
  const resolution = state.childhood.stage2.resolution;
  if (
    resolution?.status !== "complete" ||
    !resolution.module.flexPolicy ||
    !state.selections.stage2
  ) {
    throw new TypeError("Expected complete flex fixture");
  }
  return validateFlexAllocations(
    resolution.module.flexPolicy,
    state.selections.stage2.flexGrants,
    state.childhood.stage2.flexTargets,
  );
}

describe("wizard reducer Stage 0", () => {
  it("keeps the six-page topology and stage mapping", () => {
    // Given / When / Then: declared pages map to the desktop stage ids.
    expect(WIZARD_PAGES.map((page) => page.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(WIZARD_PAGES.map((page) => stageForPage(page.id))).toEqual([
      null,
      "stage0",
      "stage1",
      "stage2",
      "stage3",
      "stage4",
    ]);
    expect(
      WIZARD_PAGES.filter((page) => page.key !== "intro").map((page) =>
        pageForStage(page.key),
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });
  it("uses the draft name as the sole authority when renamed after completion", () => {
    // Given
    const state = drive(major);
    // When
    const renamed = wizardReducer(state, { type: "setName", name: "Lisa" });
    // Then
    expect(renamed.draft.scalars.name).toBe("Lisa");
    expect(renamed.characterName).toBe("Lisa");
    expect(renamed.xp.remaining).toBe(4220);
  });
  it("applies the literal Major Periphery oracle when complete", () => {
    // Given / When
    const state = drive(major);
    // Then
    expect(state.stage0Complete).toBe(true);
    expect(state.xp).toMatchObject({ spent: 780, remaining: 4220 });
    expect([state.moduleXpSpent, state.wizardXpRemaining]).toEqual([75, 4925]);
    expect(
      state.draft.skills.filter((row) => row.name === "Language/English"),
    ).toEqual([{ name: "Language/English", xp: 20 }]);
    expect(state.draft.scalars.gmxpmod).toBe(0);
  });
  const omissions = [path(9, 0, choiceCasteIndex), path(11, 1)].flatMap(
    (required) =>
      required.flatMap((action, index) => {
        if (action.type !== "setStage0Choice")
          return [
            {
              label: action.type,
              actions: required.filter((_, i) => i !== index),
            },
          ];
        return action.candidates.map((_, position) => ({
          label: `${action.layer}:${action.choiceId}:${position}`,
          actions: required.map((entry, i) =>
            i === index
              ? {
                  ...action,
                  candidates: action.candidates.filter(
                    (_, p) => p !== position,
                  ),
                }
              : entry,
          ),
        }));
      }),
  );
  it.each(omissions)("blocks Next when $label is omitted", ({ actions }) => {
    // Given
    const state = drive([{ type: "next" }, ...actions]);
    // When
    const next = wizardReducer(state, { type: "next" });
    // Then
    expect(state.stage0Complete).toBe(false);
    expect(next.pageId).toBe(1);
    expect(next.draft).toEqual(state.draft);
  });
  const invalid: readonly WizardAction[] = [
    { type: "setStage0Affiliation", affiliationId: -1 },
    { type: "setStage0SubAffiliation", subAffiliationId: 999 },
    { type: "setStage0Caste", casteId: "foreign" },
    { type: "setStage0Caste", casteId: stage0Catalog.castes[0].name },
    { type: "setStage0StartingLanguage", startingLanguage: "English" },
    {
      type: "setStage0Choice",
      layer: "base",
      choiceId: "foreign",
      candidates: [],
    },
    {
      type: "setStage0Choice",
      layer: "caste",
      choiceId: "affElem1",
      candidates: [{ kind: "skill", value: "foreign" }],
    },
  ];
  it.each(invalid)(
    "rejects foreign payloads without mutation: %j",
    (action) => {
      // Given
      const state = drive(major);
      const before = structuredClone(state);
      // When
      const next = wizardReducer(state, action);
      // Then
      expect(next).toEqual(before);
      expect(state).toEqual(before);
    },
  );
  it.each(invalid)(
    "rejects invalid payloads even before required ancestors: %j",
    (action) => {
      // Given / When / Then
      const state = initialWizardState();
      expect(wizardReducer(state, action)).toEqual(state);
    },
  );
  it.each([major, path(9), path(11)].map((actions) => ({ actions })))(
    "reselects idempotently without clearing descendants",
    ({ actions }) => {
      // Given
      const state = drive(actions);
      // When
      const next = drive(actions, state);
      // Then
      expect(next).toEqual(state);
    },
  );
  it("clears all descendants and old effects when affiliation changes", () => {
    // Given
    const state = drive(path(9));
    const before = structuredClone(state);
    // When
    const next = wizardReducer(state, major[0]);
    // Then
    expect(next.selections.stage0).toEqual({ ...empty, affiliationId: 7 });
    expect(next.draft).toEqual(initialWizardState().draft);
    expect(next.moduleXpSpent).toBe(0);
    expect(state).toEqual(before);
  });
  it("rebuilds from baseline when replacing a completed path", () => {
    // Given / When
    const state = drive(major, drive(path(9)));
    // Then
    expect(state).toEqual(drive(major));
  });
  const terranChoices = path(11).filter(
    (action) => action.type === "setStage0Choice",
  );
  it.each(terranChoices)(
    "rejects foreign candidates in real slots even if earlier slots are missing: $choiceId",
    (action) => {
      // Given
      const state = drive(
        path(11).filter((entry) => entry.type !== "setStage0Choice"),
      );
      // When
      const next = wizardReducer(state, {
        ...action,
        candidates: [{ kind: "skill", value: "foreign" }],
      });
      // Then
      expect(next).toEqual(state);
    },
  );
  it.each(terranChoices)(
    "rejects excess or duplicate selections: $choiceId",
    (action) => {
      // Given
      const state = drive(path(11));
      // When / Then
      expect(
        wizardReducer(state, {
          ...action,
          candidates: [...action.candidates, ...action.candidates],
        }),
      ).toEqual(state);
      expect(
        wizardReducer(state, {
          ...action,
          candidates: action.candidates.map(() => action.candidates[0]),
        }),
      ).toEqual(state);
    },
  );
  it("clears child choices but retains valid base choices and language when child changes", () => {
    // Given
    const state = drive(path(11, 1));
    // When
    const next = wizardReducer(state, {
      type: "setStage0SubAffiliation",
      subAffiliationId: 0,
    });
    // Then
    expect(next.selections.stage0).toEqual({
      ...state.selections.stage0,
      subAffiliationId: 0,
      choices: state.selections.stage0.choices.filter(
        (pick) => pick.layer !== "subAffiliation",
      ),
    });
    expect(next.draft).toEqual(drive(path(11)).draft);
  });
  it("clears caste choices and rebuilds when caste changes", () => {
    // Given
    const state = drive(path(9, 0, choiceCasteIndex));
    // When
    const next = wizardReducer(state, {
      type: "setStage0Caste",
      casteId: clan.castes[0],
    });
    // Then
    expect(
      state.selections.stage0.choices.some((pick) => pick.layer === "caste"),
    ).toBe(true);
    expect(next.selections.stage0.choices).toEqual(
      state.selections.stage0.choices.filter((pick) => pick.layer !== "caste"),
    );
    expect(next.draft).toEqual(drive(path(9)).draft);
  });
  it("clears an invalid language when the replacement child has no concrete language list", () => {
    // Given
    const state = drive(path(12, 1));
    expect(state.selections.stage0.startingLanguage).not.toBeNull();
    // When
    const next = wizardReducer(state, {
      type: "setStage0SubAffiliation",
      subAffiliationId: 0,
    });
    // Then
    expect(next.selections.stage0.startingLanguage).toBeNull();
    expect(next.stage0Complete).toBe(false);
    expect(next.draft).toEqual(initialWizardState().draft);
  });
  it("removes dependent child picks when a referenced base choice changes", () => {
    // Given
    const affiliation = stage0Catalog.affiliations.find(
      (entry) => entry.id === 11,
    );
    const child = affiliation?.subAffiliations.find((entry) =>
      entry.layer.choices.some(
        (slot) =>
          slot.candidateSelection.mode === "includeSelected" &&
          slot.candidateSelection.references.some(
            (reference) =>
              reference.scope === "base" && reference.choiceId === "affElem1",
          ),
      ),
    );
    if (!child) throw new TypeError("Missing dependent child fixture");
    const state = drive(path(11, child.id));
    const pick = state.selections.stage0.choices.find(
      (entry) => entry.layer === "base" && entry.choiceId === "affElem1",
    );
    const choice = affiliation?.base.choices.find(
      (entry) => entry.id === "affElem1",
    );
    if (!pick || !choice)
      throw new TypeError("Missing language choice fixture");
    const candidates = choice.candidates.slice(2, 4);
    // When
    const next = wizardReducer(state, {
      type: "setStage0Choice",
      ...pick,
      candidates,
    });
    // Then
    expect(
      next.selections.stage0.choices
        .filter((entry) => entry.layer === "subAffiliation")
        .flatMap((entry) => entry.candidates),
    ).not.toContainEqual(pick.candidates[0]);
    expect(next.stage0Complete).toBe(false);
    expect(next.moduleXpSpent).toBe(0);
  });
  it("derives completion and ledgers from the domain rebuild for choice-bearing paths", () => {
    // Given: Terran/None, English + Mandarin, STR + RFL; None adds no grants.
    const actions = path(11);
    // When
    const state = drive(actions);
    // Then: attributes 850 + skills 85 + traits 25 = 960; module cost is 240.
    expect(state).toMatchObject({
      xp: { spent: 960, remaining: 4040 },
      moduleXpSpent: 240,
      wizardXpRemaining: 4760,
      stage0Complete: true,
    });
    expect(state.draft.attrs).toEqual({
      STR: 150,
      BOD: 100,
      RFL: 150,
      DEX: 100,
      INT: 200,
      WIL: 100,
      CHA: 100,
      EDG: -50,
    });
    expect(state.draft.skills).toEqual([
      { name: "Perception", xp: 10 },
      { name: "Language/English", xp: 60 },
      { name: "Language/Mandarin Chinese", xp: 15 },
    ]);
    expect(state.draft.traits).toEqual([
      { name: "Compulsion/Distrust of Non-Terrans", xp: -75 },
      { name: "Reputation", xp: 100 },
    ]);
  });
  it("retains Stage 0 and removes completed childhood grants on Back", () => {
    const stage0 = drive([{ type: "next" }, ...major]);
    const state = completeStage1(wizardReducer(stage0, { type: "next" }));
    const next = wizardReducer(state, { type: "back" });
    expect(next.pageId).toBe(1);
    expect(next.draft).toEqual(stage0.draft);
    expect(next.selections.stage0).toEqual(stage0.selections.stage0);
    expect(next.selections.stage1).toBeNull();
    expect([next.xp.remaining, next.wizardXpRemaining]).toEqual([4220, 4925]);
  });
  it("unwinds to baseline while preserving the Intro name", () => {
    // Given
    const baseline = drive([{ type: "setName", name: "Lisa" }]);
    const state = drive([{ type: "next" }, ...path(9)], baseline);
    // When
    const next = wizardReducer(state, { type: "back" });
    // Then
    expect(next).toEqual(baseline);
    expect(next.draft.scalars.name).toBe("Lisa");
    expect([next.moduleXpSpent, next.wizardXpRemaining]).toEqual([0, 5000]);
    expect(drive([{ type: "next" }, ...major], next).xp.remaining).toBe(4220);
  });
  it("preserves navigation bounds after completing each required stage", () => {
    const intro = initialWizardState();
    const last = drive([{ type: "next" }, { type: "next" }], ordinaryStage2());
    expect(wizardReducer(intro, { type: "back" }).pageId).toBe(0);
    expect(last.pageId).toBe(5);
    expect(wizardReducer(last, { type: "next" }).pageId).toBe(5);
  });
});

describe("wizard reducer childhood replay", () => {
  it("requires every Stage 1 choice and a Stage 2 module before advancing", () => {
    const prefix = drive([{ type: "next" }, ...major, { type: "next" }]);
    expect(canAdvance(prefix)).toBe(false);
    expect(wizardReducer(prefix, { type: "next" }).pageId).toBe(2);
    let state = wizardReducer(prefix, {
      type: "setStageModule",
      stage: "stage1",
      moduleName: "Street",
    });
    const resolution = state.childhood.stage1.resolution;
    if (resolution?.status !== "incomplete" || !resolution.module)
      throw new TypeError("Missing Street choices");
    expect(resolution.module.layer.choices).toHaveLength(4);
    for (const [index, choice] of resolution.module.layer.choices.entries()) {
      expect(state.draft).toEqual(prefix.draft);
      expect(canAdvance(state)).toBe(false);
      state = wizardReducer(state, {
        type: "setStageChoice",
        stage: "stage1",
        choiceId: choice.id,
        candidates: [strength],
      });
      expect(state.stage1Complete).toBe(index === 3);
    }
    expect([
      state.xp.remaining,
      state.wizardXpRemaining,
      state.draft.attrs.STR,
      skillXp(state, "Perception"),
    ]).toEqual([4020, 4675, 165, 20]);
    const next = wizardReducer(state, { type: "next" });
    expect(next.pageId).toBe(3);
    expect(canAdvance(next)).toBe(false);
    expect(wizardReducer(next, { type: "next" }).pageId).toBe(3);
  });

  it("replaces and refunds independent flex without touching static grants or Wizard XP", () => {
    const fixed = ordinaryStage2();
    expect([
      fixed.xp.remaining,
      fixed.wizardXpRemaining,
      skillXp(fixed, "Perception"),
    ]).toEqual([3615, 4175, 65]);
    expect(fixed.draft.scalars).toMatchObject({
      earlychild: "Street",
      latechild: "Back Woods",
      age: 16,
      gmxpmod: 0,
    });
    expect(flexBalance(fixed)).toEqual({
      valid: true,
      spent: 0,
      remaining: 125,
    });
    const allocated = wizardReducer(fixed, {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 35,
    });
    expect([
      skillXp(allocated, "Perception"),
      allocated.xp.remaining,
      allocated.wizardXpRemaining,
    ]).toEqual([100, 3580, 4175]);
    expect(flexBalance(allocated)).toEqual({
      valid: true,
      spent: 35,
      remaining: 90,
    });
    expect(
      wizardReducer(allocated, {
        type: "setStage2FlexGrant",
        candidate: perception,
        xp: 36,
      }),
    ).toEqual(allocated);
    const reduced = wizardReducer(allocated, {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 20,
    });
    expect([
      skillXp(reduced, "Perception"),
      reduced.xp.remaining,
      reduced.wizardXpRemaining,
    ]).toEqual([85, 3595, 4175]);
    expect(flexBalance(reduced)).toEqual({
      valid: true,
      spent: 20,
      remaining: 105,
    });
    const cleared = wizardReducer(reduced, {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 0,
    });
    expect(cleared.draft).toEqual(fixed.draft);
    expect(flexBalance(cleared)).toEqual({
      valid: true,
      spent: 0,
      remaining: 125,
    });
    expect(wizardReducer(allocated, { type: "resetStage2Flex" }).draft).toEqual(
      fixed.draft,
    );
    const renamed = wizardReducer(allocated, { type: "setName", name: "Lisa" });
    expect(renamed.draft).toEqual({
      ...allocated.draft,
      scalars: { ...allocated.draft.scalars, name: "Lisa" },
    });
    expect(renamed.selections.stage2).toEqual(allocated.selections.stage2);
  });

  it("removes Stage 2 age, grants and cost on Back and re-enters without drift", () => {
    const stage1 = completeStage1();
    const allocated = wizardReducer(ordinaryStage2(), {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 35,
    });
    const back = wizardReducer(allocated, { type: "back" });
    expect(back.pageId).toBe(2);
    expect(back.draft).toEqual(stage1.draft);
    expect([
      back.xp.remaining,
      back.wizardXpRemaining,
      skillXp(back, "Perception"),
    ]).toEqual([4020, 4675, 20]);
    expect(back.selections.stage2).toBeNull();
    expect(back.stage2Handoff).toBeNull();
    const repeated = drive(
      [
        { type: "next" },
        { type: "setStageModule", stage: "stage2", moduleName: "Back Woods" },
        { type: "setStage2FlexGrant", candidate: perception, xp: 35 },
      ],
      back,
    );
    expect(repeated.draft).toEqual(allocated.draft);
    expect(repeated.wizardXpRemaining).toBe(4175);
  });

  it("rejects ineligible modules and wrong-page reducer bypasses", () => {
    const state = ordinaryStage2();
    const names = state.childhood.stage2.modules.map((module) => module.name);
    for (const moduleName of [
      "High School",
      "Preparatory School",
      "Clan Apprenticeship",
      "Freeborn Sibko",
      "Trueborn Sibko",
    ]) {
      expect(names).not.toContain(moduleName);
      expect(
        wizardReducer(state, {
          type: "setStageModule",
          stage: "stage2",
          moduleName,
        }),
      ).toEqual(state);
    }
    const invalid: readonly WizardAction[] = [
      { type: "setStageModule", stage: "stage1", moduleName: "Farm" },
      {
        type: "setStageChoice",
        stage: "stage1",
        choiceId: "more:1",
        candidates: [strength],
      },
      { type: "setStage1Phenotype", phenotype: "Phenotype/Elemental" },
      {
        type: "setStageChoice",
        stage: "stage2",
        choiceId: "foreign",
        candidates: [strength],
      },
      { type: "setSibkoBranch", branch: "Aerospace" },
      {
        type: "setStage2FlexGrant",
        candidate: { kind: "skill", value: "Language/Any" },
        xp: 5,
      },
      {
        type: "setStage2FlexGrant",
        candidate: { kind: "skill", value: "foreign" },
        xp: 5,
      },
      ...[-1, 0.5, NaN, Infinity, 36].map((xp): WizardAction => ({
        type: "setStage2FlexGrant",
        candidate: perception,
        xp,
      })),
    ];
    for (const action of invalid)
      expect(wizardReducer(state, action)).toEqual(state);
    const later = wizardReducer(state, { type: "next" });
    expect(
      wizardReducer(later, {
        type: "setStage2FlexGrant",
        candidate: perception,
        xp: 35,
      }),
    ).toEqual(later);
    const stage1 = completeStage1();
    expect(
      wizardReducer(stage1, {
        type: "setStageModule",
        stage: "stage2",
        moduleName: "Back Woods",
      }),
    ).toEqual(stage1);
  });

  it("clears flex on an incomplete fixed choice and restores only the fixed package", () => {
    const prefix = wizardReducer(completeStage1(), { type: "next" });
    const selected = wizardReducer(prefix, {
      type: "setStageModule",
      stage: "stage2",
      moduleName: "Farm",
    });
    const complete = completeChoices(selected, "stage2");
    const pick = complete.selections.stage2?.choices[0];
    if (!pick) throw new TypeError("Missing Farm interest choice");
    const allocated = wizardReducer(complete, {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 35,
    });
    const incomplete = wizardReducer(allocated, {
      type: "setStageChoice",
      stage: "stage2",
      choiceId: pick.choiceId,
      candidates: [],
    });
    expect(incomplete.stage2Complete).toBe(false);
    expect(incomplete.draft).toEqual(prefix.draft);
    expect(incomplete.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
    expect(incomplete.selections.stage2?.flexGrants).toEqual([]);
    expect(canAdvance(incomplete)).toBe(false);
    expect(
      wizardReducer(incomplete, {
        type: "setStage2FlexGrant",
        candidate: perception,
        xp: 35,
      }),
    ).toEqual(incomplete);
    const restored = wizardReducer(incomplete, {
      type: "setStageChoice",
      stage: "stage2",
      ...pick,
    });
    expect(restored.draft).toEqual(complete.draft);
    expect(restored.selections.stage2?.flexGrants).toEqual([]);
    expect(
      wizardReducer(complete, {
        type: "setStageChoice",
        stage: "stage2",
        ...pick,
        candidates: [...pick.candidates, ...pick.candidates],
      }),
    ).toEqual(complete);
    expect(
      wizardReducer(complete, {
        type: "setStageChoice",
        stage: "stage2",
        ...pick,
        candidates: [strength],
      }),
    ).toEqual(complete);
  });

  it("replaces a module without retaining its old grants, choices or flex", () => {
    const allocated = wizardReducer(ordinaryStage2(), {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 35,
    });
    const replacement = wizardReducer(allocated, {
      type: "setStageModule",
      stage: "stage2",
      moduleName: "Farm",
    });
    expect(replacement.draft).toEqual(completeStage1().draft);
    expect(replacement.selections.stage2?.choices).toEqual([]);
    expect(replacement.selections.stage2?.flexGrants).toEqual([]);
    const restored = wizardReducer(replacement, {
      type: "setStageModule",
      stage: "stage2",
      moduleName: "Back Woods",
    });
    expect(restored.draft).toEqual(ordinaryStage2().draft);
    const upstream = wizardReducer(allocated, {
      type: "setStage0StartingLanguage",
      startingLanguage: null,
    });
    expect(upstream.selections.stage1).toBeNull();
    expect(upstream.selections.stage2).toBeNull();
    expect(upstream.stage2Handoff).toBeNull();
    expect(upstream.moduleXpSpent).toBe(0);
  });

  it("allows refunds after allowance exhaustion without spending Wizard XP", () => {
    const fixed = ordinaryStage2();
    const exhausted = wizardReducer(fixed, {
      type: "setStage2FlexGrant",
      candidate: strength,
      xp: 125,
    });
    expect(flexBalance(exhausted)).toEqual({
      valid: true,
      spent: 125,
      remaining: 0,
    });
    expect(
      wizardReducer(exhausted, {
        type: "setStage2FlexGrant",
        candidate: perception,
        xp: 1,
      }),
    ).toEqual(exhausted);
    const refunded = wizardReducer(exhausted, {
      type: "setStage2FlexGrant",
      candidate: strength,
      xp: 100,
    });
    const reallocated = wizardReducer(refunded, {
      type: "setStage2FlexGrant",
      candidate: perception,
      xp: 25,
    });
    expect(flexBalance(reallocated)).toEqual({
      valid: true,
      spent: 125,
      remaining: 0,
    });
    expect(reallocated.draft.attrs.STR).toBe(fixed.draft.attrs.STR + 100);
    expect(skillXp(reallocated, "Perception")).toBe(90);
    expect(reallocated.xp.remaining).toBe(fixed.xp.remaining - 125);
    expect(reallocated.wizardXpRemaining).toBe(fixed.wizardXpRemaining);
  });

  it("uses Civilian Job age 18 and restores the entering age when unwound", () => {
    const stage1 = completeStage1(
      drive([{ type: "next" }, ...path(0), { type: "next" }]),
    );
    const state = completeChoices(
      drive(
        [
          { type: "next" },
          {
            type: "setStageModule",
            stage: "stage2",
            moduleName: "Civilian Job",
          },
        ],
        stage1,
      ),
      "stage2",
    );
    expect(state.stage2Complete).toBe(true);
    expect(state.draft.scalars.age).toBe(18);
    expect(state.draft.scalars.latechild).toBe("Civilian Job");
    const back = wizardReducer(state, { type: "back" });
    expect(back.draft).toEqual(stage1.draft);
    expect(back.draft.scalars.age).toBe(stage1.draft.scalars.age);
    expect(back.moduleXpSpent).toBe(stage1.moduleXpSpent);
  });
});

describe("wizard reducer Clan fields and handoff", () => {
  it("requires Creche phenotype without applying phenotype catalog attribute adjustments", () => {
    const ghostBear = clan.subAffiliations.find(
      (child) => child.name === "Ghost Bear",
    );
    if (!ghostBear) throw new TypeError("Missing Ghost Bear fixture");
    const prefix = drive([
      { type: "next" },
      ...path(9, ghostBear.id),
      { type: "next" },
    ]);
    const incomplete = completeStage1(prefix, "Trueborn Creche");
    expect(incomplete.stage1Complete).toBe(false);
    expect(incomplete.draft).toEqual(prefix.draft);
    expect(
      wizardReducer(incomplete, {
        type: "setStage1Phenotype",
        phenotype: "foreign",
      }),
    ).toEqual(incomplete);
    const elemental = wizardReducer(incomplete, {
      type: "setStage1Phenotype",
      phenotype: "Phenotype/Elemental",
    });
    const aerospace = wizardReducer(elemental, {
      type: "setStage1Phenotype",
      phenotype: "Phenotype/Aerospace",
    });
    expect(elemental.stage1Complete).toBe(true);
    expect(elemental.draft.scalars.phenotype).toBe("Phenotype/Elemental");
    expect(aerospace.draft.attrs).toEqual(elemental.draft.attrs);
    expect(
      wizardReducer(elemental, {
        type: "setStageModule",
        stage: "stage1",
        moduleName: "Street",
      }).draft.scalars.phenotype,
    ).toBe(prefix.draft.scalars.phenotype);
  });

  it("credits Freeborn rebate only across the Stage 3 boundary, never cumulatively", () => {
    const prefix = clanStage2();
    const pending = wizardReducer(prefix, {
      type: "setStageModule",
      stage: "stage2",
      moduleName: "Freeborn Sibko",
    });
    expect(canAdvance(pending)).toBe(false);
    const emptyFields = wizardReducer(pending, {
      type: "setSibkoBranch",
      branch: "Aerospace",
    });
    expect(canAdvance(emptyFields)).toBe(true);
    expect(emptyFields.stage2Handoff?.rebateXp).toBe(0);
    const full = fillFields(emptyFields);
    expect(full.stage2Handoff).toMatchObject({
      rebateXp: 86,
      militaryField: false,
    });
    const handoff = full.stage2Handoff;
    expect(
      [
        ...(handoff?.basicSkills ?? []),
        ...(handoff?.advancedSkills ?? []),
      ].reduce((sum, row) => sum + row.xp, 0),
    ).toBe(430);
    const allocated = drive(
      [
        { type: "setStage2FlexGrant", candidate: strength, xp: 100 },
        {
          type: "setStage2FlexGrant",
          candidate: { kind: "trait", value: "Vehicle" },
          xp: 100,
        },
      ],
      full,
    );
    expect(
      allocated.draft.traits.find((row) => row.name === "Vehicle")?.xp,
    ).toBe(
      (prefix.draft.traits.find((row) => row.name === "Vehicle")?.xp ?? 0) +
        200,
    );
    expect([allocated.xp.remaining, allocated.wizardXpRemaining]).toEqual([
      prefix.xp.remaining - 1030,
      prefix.wizardXpRemaining - 950,
    ]);
    expect(flexBalance(allocated)).toEqual({
      valid: true,
      spent: 200,
      remaining: 0,
    });
    const entered = wizardReducer(allocated, { type: "next" });
    expect(entered.pageId).toBe(4);
    expect(entered.wizardXpRemaining).toBe(prefix.wizardXpRemaining - 864);
    expect(entered.moduleXpSpent).toBe(allocated.moduleXpSpent);
    const back = wizardReducer(entered, { type: "back" });
    expect(back.pageId).toBe(3);
    expect(back.wizardXpRemaining).toBe(prefix.wizardXpRemaining - 950);
    expect(back.draft).toEqual(allocated.draft);
    expect(back.selections.stage2).toEqual(allocated.selections.stage2);
    expect(wizardReducer(back, { type: "next" }).wizardXpRemaining).toBe(
      entered.wizardXpRemaining,
    );
    expect(back.draft.scalars.phenotype).toBe("Phenotype/Elemental");
  });

  it("replaces branches and Trueborn module effects without leaking fields, flex or rebate", () => {
    const prefix = clanStage2();
    const aerospace = fillFields(
      drive(
        [
          {
            type: "setStageModule",
            stage: "stage2",
            moduleName: "Freeborn Sibko",
          },
          { type: "setSibkoBranch", branch: "Aerospace" },
        ],
        prefix,
      ),
    );
    const allocated = wizardReducer(aerospace, {
      type: "setStage2FlexGrant",
      candidate: strength,
      xp: 100,
    });
    const cavalry = wizardReducer(allocated, {
      type: "setSibkoBranch",
      branch: "Cavalry",
    });
    const cleanCavalry = drive(
      [
        {
          type: "setStageModule",
          stage: "stage2",
          moduleName: "Freeborn Sibko",
        },
        { type: "setSibkoBranch", branch: "Cavalry" },
      ],
      prefix,
    );
    expect(cavalry.draft).toEqual(cleanCavalry.draft);
    expect(cavalry.stage2Handoff).toMatchObject({
      basicSkills: [],
      advancedSkills: [],
      rebateXp: 0,
    });
    expect(cavalry.selections.stage2?.flexGrants).toEqual([]);
    const trueborn = wizardReducer(cavalry, {
      type: "setStageModule",
      stage: "stage2",
      moduleName: "Trueborn Sibko",
    });
    expect(trueborn.draft).toEqual(prefix.draft);
    expect(trueborn.stage2Handoff).toBeNull();
    expect(
      wizardReducer(trueborn, {
        type: "setSibkoBranch",
        branch: "ProtoMech (Advanced)",
      }),
    ).toEqual(trueborn);
    const elemental = fillFields(
      wizardReducer(trueborn, {
        type: "setSibkoBranch",
        branch: "Elemental (Advanced)",
      }),
    );
    expect(elemental.moduleXpSpent - prefix.moduleXpSpent).toBe(1600);
    expect(elemental.stage2Handoff).toMatchObject({
      rebateXp: 172,
      militaryField: true,
    });
    expect(
      skillXp(elemental, "Small Arms") - skillXp(prefix, "Small Arms"),
    ).toBe(130);
    expect(
      [
        ...(elemental.stage2Handoff?.basicSkills ?? []),
        ...(elemental.stage2Handoff?.advancedSkills ?? []),
      ].reduce((sum, row) => sum + row.xp, 0),
    ).toBe(860);
    expect(flexBalance(elemental)).toEqual({
      valid: true,
      spent: 0,
      remaining: 50,
    });
    const nextBranch = wizardReducer(
      wizardReducer(elemental, {
        type: "setStage2FlexGrant",
        candidate: strength,
        xp: 50,
      }),
      { type: "setSibkoBranch", branch: "Aerospace" },
    );
    const clean = wizardReducer(trueborn, {
      type: "setSibkoBranch",
      branch: "Aerospace",
    });
    expect(nextBranch.draft).toEqual(clean.draft);
    expect(nextBranch.stage2Handoff).toEqual(clean.stage2Handoff);
    expect(nextBranch.wizardXpRemaining).toBe(clean.wizardXpRemaining);
    expect(nextBranch.draft.scalars.phenotype).toBe("Phenotype/Elemental");
  });

  it("removes flex owned by a raw field target when that field is cleared", () => {
    const cavalry = drive(
      [
        {
          type: "setStageModule",
          stage: "stage2",
          moduleName: "Freeborn Sibko",
        },
        { type: "setSibkoBranch", branch: "Cavalry" },
      ],
      clanStage2(),
    );
    const target: Stage0Candidate = { kind: "skill", value: "Air Vehicle" };
    expect(cavalry.childhood.stage2.flexTargets).not.toContainEqual(target);
    const selected = wizardReducer(cavalry, {
      type: "setSibkoField",
      pool: "advanced",
      groupId: "cavalry-3",
      skill: "Air Vehicle",
    });
    expect(selected.childhood.stage2.flexTargets).toContainEqual(target);
    const allocated = drive(
      [
        { type: "setStage2FlexGrant", candidate: target, xp: 35 },
        { type: "setStage2FlexGrant", candidate: perception, xp: 20 },
      ],
      selected,
    );
    expect(skillXp(allocated, "Air Vehicle")).toBe(85);
    const cleared = wizardReducer(allocated, {
      type: "setSibkoField",
      pool: "advanced",
      groupId: "cavalry-3",
      skill: null,
    });
    expect(skillXp(cleared, "Air Vehicle")).toBe(0);
    expect(cleared.selections.stage2?.flexGrants).toEqual([
      { candidate: perception, xp: 20 },
    ]);
    expect(skillXp(cleared, "Perception")).toBe(
      skillXp(cavalry, "Perception") + 20,
    );
    expect(cleared.stage2Handoff?.rebateXp).toBe(0);
    expect(
      wizardReducer(cleared, {
        type: "setStage2FlexGrant",
        candidate: target,
        xp: 35,
      }),
    ).toEqual(cleared);
  });

  it("keeps a Cavalry group single-valued when changing or clearing its alternative", () => {
    const cavalry = drive(
      [
        {
          type: "setStageModule",
          stage: "stage2",
          moduleName: "Freeborn Sibko",
        },
        { type: "setSibkoBranch", branch: "Cavalry" },
      ],
      clanStage2(),
    );
    const sea = wizardReducer(cavalry, {
      type: "setSibkoField",
      pool: "advanced",
      groupId: "cavalry-2",
      skill: "Driving/Sea Vehicles",
    });
    expect(
      skillXp(sea, "Driving/Sea Vehicles") -
        skillXp(cavalry, "Driving/Sea Vehicles"),
    ).toBe(50);
    expect(
      wizardReducer(sea, {
        type: "setSibkoField",
        pool: "advanced",
        groupId: "cavalry-2",
        skill: "Small Arms",
      }),
    ).toEqual(sea);
    const rail = wizardReducer(sea, {
      type: "setSibkoField",
      pool: "advanced",
      groupId: "cavalry-2",
      skill: "Driving/Rail Vehicles",
    });
    expect(skillXp(rail, "Driving/Sea Vehicles")).toBe(
      skillXp(cavalry, "Driving/Sea Vehicles"),
    );
    expect(
      skillXp(rail, "Driving/Rail Vehicles") -
        skillXp(cavalry, "Driving/Rail Vehicles"),
    ).toBe(50);
    expect(rail.stage2Handoff?.rebateXp).toBe(10);
    expect(
      wizardReducer(rail, {
        type: "setSibkoField",
        pool: "advanced",
        groupId: "cavalry-2",
        skill: null,
      }).draft,
    ).toEqual(cavalry.draft);
  });
});
