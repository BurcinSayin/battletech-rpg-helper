import { describe, it, expect } from "vitest";
import { stage0Catalog } from "@/lib/rules/load";
import { resolveStage0Candidates } from "./wizard-stage0";
import type { Stage0LayerId, Stage0Selection } from "./wizard-stage0";
import { WIZARD_PAGES, initialWizardState, pageForStage, stageForPage, wizardReducer } from "./wizard-state";
import type { WizardAction, WizardDraftState } from "./wizard-state";

const empty: Stage0Selection = { affiliationId: null, subAffiliationId: null, casteId: null, startingLanguage: null, choices: [] };
const major: readonly WizardAction[] = [
  { type: "setStage0Affiliation", affiliationId: 7 },
  { type: "setStage0SubAffiliation", subAffiliationId: 0 },
  { type: "setStage0StartingLanguage", startingLanguage: "Language/English" },
];
const clan = stage0Catalog.affiliations.find((entry) => entry.id === 9);
if (!clan) throw new TypeError("Missing Clan fixture");
const choiceCasteIndex = clan.castes.findIndex((name) => stage0Catalog.castes.some((entry) => entry.name === name && entry.layer.choices.length > 0));
function drive(actions: readonly WizardAction[], state = initialWizardState()): WizardDraftState {
  return actions.reduce(wizardReducer, state);
}
// Real catalog fixtures: select every position, respecting dependent candidate sets.
function path(affiliationId: number, subAffiliationId = 0, casteIndex = 0): readonly WizardAction[] {
  const affiliation = stage0Catalog.affiliations.find((entry) => entry.id === affiliationId);
  const child = affiliation?.subAffiliations.find((entry) => entry.id === subAffiliationId);
  if (!affiliation || !child) throw new TypeError("Missing catalog fixture");
  const casteId = affiliation.casteRequired ? (child.castes ?? affiliation.castes)[casteIndex] : null;
  const language = (child.startingLanguages ?? affiliation.startingLanguages).candidates[0];
  if (casteId === undefined || !language) throw new TypeError("Incomplete catalog fixture");
  let selection: Stage0Selection = { ...empty, affiliationId, subAffiliationId, casteId, startingLanguage: language };
  const actions: WizardAction[] = [
    { type: "setStage0Affiliation", affiliationId },
    { type: "setStage0SubAffiliation", subAffiliationId },
    ...(casteId === null ? [] : [{ type: "setStage0Caste", casteId } satisfies WizardAction]),
    { type: "setStage0StartingLanguage", startingLanguage: language },
  ];
  const layers = [
    { id: "base", layer: affiliation.base },
    { id: "subAffiliation", layer: child.layer },
    { id: "caste", layer: stage0Catalog.castes.find((entry) => entry.name === casteId)?.layer },
  ] satisfies readonly { readonly id: Stage0LayerId; readonly layer: typeof affiliation.base | undefined }[];
  for (const { id: layer, layer: data } of layers) {
    for (const choice of data?.choices ?? []) {
      const candidates = resolveStage0Candidates(choice, layer, selection).slice(0, choice.selectionCount);
      const pick = { layer, choiceId: choice.id, candidates };
      selection = { ...selection, choices: [...selection.choices, pick] };
      actions.push({ type: "setStage0Choice", ...pick });
    }
  }
  return actions;
}

describe("wizard reducer Stage 0", () => {
  it("keeps the six-page topology and stage mapping", () => {
    // Given / When / Then: declared pages map to the desktop stage ids.
    expect(WIZARD_PAGES.map((page) => page.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(WIZARD_PAGES.map((page) => stageForPage(page.id))).toEqual([null, "stage0", "stage1", "stage2", "stage3", "stage4"]);
    expect(WIZARD_PAGES.filter((page) => page.key !== "intro").map((page) => pageForStage(page.key))).toEqual([1, 2, 3, 4, 5]);
  });
  it("uses the draft name as the sole authority when renamed after completion", () => {
    // Given
    const state = drive(major);
    // When
    const renamed = wizardReducer(state, { type: "setName", name: "Lisa" });
    // Then
    expect(renamed.draft.scalars.name).toBe("Lisa");
    expect(Object.getOwnPropertyDescriptor(renamed, "characterName")?.get).toBeTypeOf("function");
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
    expect(state.draft.skills.filter((row) => row.name === "Language/English")).toEqual([{ name: "Language/English", xp: 20 }]);
    expect(state.draft.scalars.gmxpmod).toBe(0);
  });
  const omissions = [path(9, 0, choiceCasteIndex), path(11, 1)].flatMap((required) => required.flatMap((action, index) => {
    if (action.type !== "setStage0Choice") return [{ label: action.type, actions: required.filter((_, i) => i !== index) }];
    return action.candidates.map((_, position) => ({ label: `${action.layer}:${action.choiceId}:${position}`, actions: required.map((entry, i) => i === index ? { ...action, candidates: action.candidates.filter((_, p) => p !== position) } : entry) }));
  }));
  it.each(omissions)("blocks Next when $label is omitted", ({ actions }) => {
    // Given
    const state = drive([{ type: "next" }, ...actions]);
    // When
    const next = wizardReducer(state, { type: "next" });
    // Then
    expect(state.stage0Complete).toBe(false);
    expect(next).toBe(state);
  });
  const invalid: readonly WizardAction[] = [
    { type: "setStage0Affiliation", affiliationId: -1 },
    { type: "setStage0SubAffiliation", subAffiliationId: 999 },
    { type: "setStage0Caste", casteId: "foreign" },
    { type: "setStage0Caste", casteId: stage0Catalog.castes[0].name },
    { type: "setStage0StartingLanguage", startingLanguage: "English" },
    { type: "setStage0Choice", layer: "base", choiceId: "foreign", candidates: [] },
    { type: "setStage0Choice", layer: "caste", choiceId: "affElem1", candidates: [{ kind: "skill", value: "foreign" }] },
  ];
  it.each(invalid)("rejects foreign payloads without mutation: %j", (action) => {
    // Given
    const state = drive(major);
    const before = structuredClone(state);
    // When
    const next = wizardReducer(state, action);
    // Then
    expect(next).toBe(state);
    expect(state).toEqual(before);
  });
  it.each(invalid)("rejects invalid payloads even before required ancestors: %j", (action) => {
    // Given / When / Then
    const state = initialWizardState();
    expect(wizardReducer(state, action)).toBe(state);
  });
  it.each([major, path(9), path(11)].map((actions) => ({ actions })))("reselects idempotently without clearing descendants", ({ actions }) => {
    // Given
    const state = drive(actions);
    // When
    const next = drive(actions, state);
    // Then
    expect(next).toBe(state);
  });
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
  const terranChoices = path(11).filter((action) => action.type === "setStage0Choice");
  it.each(terranChoices)("rejects foreign candidates in real slots even if earlier slots are missing: $choiceId", (action) => {
    // Given
    const state = drive(path(11).filter((entry) => entry.type !== "setStage0Choice"));
    // When
    const next = wizardReducer(state, { ...action, candidates: [{ kind: "skill", value: "foreign" }] });
    // Then
    expect(next).toBe(state);
  });
  it.each(terranChoices)("rejects excess or duplicate selections: $choiceId", (action) => {
    // Given
    const state = drive(path(11));
    // When / Then
    expect(wizardReducer(state, { ...action, candidates: [...action.candidates, ...action.candidates] })).toBe(state);
    expect(wizardReducer(state, { ...action, candidates: action.candidates.map(() => action.candidates[0]) })).toBe(state);
  });
  it("clears child choices but retains valid base choices and language when child changes", () => {
    // Given
    const state = drive(path(11, 1));
    // When
    const next = wizardReducer(state, { type: "setStage0SubAffiliation", subAffiliationId: 0 });
    // Then
    expect(next.selections.stage0).toEqual({ ...state.selections.stage0, subAffiliationId: 0, choices: state.selections.stage0.choices.filter((pick) => pick.layer !== "subAffiliation") });
    expect(next.draft).toEqual(drive(path(11)).draft);
  });
  it("clears caste choices and rebuilds when caste changes", () => {
    // Given
    const state = drive(path(9, 0, choiceCasteIndex));
    // When
    const next = wizardReducer(state, { type: "setStage0Caste", casteId: clan.castes[0] });
    // Then
    expect(state.selections.stage0.choices.some((pick) => pick.layer === "caste")).toBe(true);
    expect(next.selections.stage0.choices).toEqual(state.selections.stage0.choices.filter((pick) => pick.layer !== "caste"));
    expect(next.draft).toEqual(drive(path(9)).draft);
  });
  it("clears an invalid language when the replacement child has no concrete language list", () => {
    // Given
    const state = drive(path(12, 1));
    expect(state.selections.stage0.startingLanguage).not.toBeNull();
    // When
    const next = wizardReducer(state, { type: "setStage0SubAffiliation", subAffiliationId: 0 });
    // Then
    expect(next.selections.stage0.startingLanguage).toBeNull();
    expect(next.stage0Complete).toBe(false);
    expect(next.draft).toEqual(initialWizardState().draft);
  });
  it("removes dependent child picks when a referenced base choice changes", () => {
    // Given
    const affiliation = stage0Catalog.affiliations.find((entry) => entry.id === 11);
    const child = affiliation?.subAffiliations.find((entry) => entry.layer.choices.some((slot) => slot.candidateSelection.mode === "includeSelected" && slot.candidateSelection.references.some((reference) => reference.scope === "base" && reference.choiceId === "affElem1")));
    if (!child) throw new TypeError("Missing dependent child fixture");
    const state = drive(path(11, child.id));
    const pick = state.selections.stage0.choices.find((entry) => entry.layer === "base" && entry.choiceId === "affElem1");
    const choice = affiliation?.base.choices.find((entry) => entry.id === "affElem1");
    if (!pick || !choice) throw new TypeError("Missing language choice fixture");
    const candidates = choice.candidates.slice(2, 4);
    // When
    const next = wizardReducer(state, { type: "setStage0Choice", ...pick, candidates });
    // Then
    expect(next.selections.stage0.choices.filter((entry) => entry.layer === "subAffiliation").flatMap((entry) => entry.candidates)).not.toContainEqual(pick.candidates[0]);
    expect(next.stage0Complete).toBe(false);
    expect(next.moduleXpSpent).toBe(0);
  });
  it("derives completion and ledgers from the domain rebuild for choice-bearing paths", () => {
    // Given: Terran/None, English + Mandarin, STR + RFL; None adds no grants.
    const actions = path(11);
    // When
    const state = drive(actions);
    // Then: attributes 850 + skills 85 + traits 25 = 960; module cost is 240.
    expect(state).toMatchObject({ xp: { spent: 960, remaining: 4040 }, moduleXpSpent: 240, wizardXpRemaining: 4760, stage0Complete: true });
    expect(state.draft.attrs).toEqual({ STR: 150, BOD: 100, RFL: 150, DEX: 100, INT: 200, WIL: 100, CHA: 100, EDG: -50 });
    expect(state.draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/English", xp: 60 }, { name: "Language/Mandarin Chinese", xp: 15 }]);
    expect(state.draft.traits).toEqual([{ name: "Compulsion/Distrust of Non-Terrans", xp: -75 }, { name: "Reputation", xp: 100 }]);
  });
  it("retains Stage 0 when returning from Stage 1 and clears later placeholders", () => {
    // Given
    const stage0 = drive([{ type: "next" }, ...major]);
    const state = drive([{ type: "next" }, { type: "select", stage: "stage1", choice: "Brat" }, { type: "select", stage: "stage4", choice: "Tour" }], stage0);
    // When
    const next = wizardReducer(state, { type: "back" });
    // Then
    expect(next).toEqual(stage0);
    expect(next.draft).toBe(stage0.draft);
    expect(next.selections.stage0).toBe(stage0.selections.stage0);
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
  it("preserves cancellation-visible state when no confirmed Back is dispatched", () => {
    // Given
    const state = drive([{ type: "next" }, ...major]);
    // When / Then: dialog open/Stay are local UI state, not reducer actions.
    expect(drive([], state)).toBe(state);
  });
  it("preserves both navigation bounds when Stage 0 is complete", () => {
    // Given
    const intro = initialWizardState();
    const last = drive(Array.from({ length: 6 }, (): WizardAction => ({ type: "next" })), drive(major));
    // When / Then
    expect(wizardReducer(intro, { type: "back" })).toBe(intro);
    expect(last.pageId).toBe(5);
    expect(wizardReducer(last, { type: "next" })).toBe(last);
  });
  it("discards the stage being left and all later stages", () => {
    // Given
    const state: WizardDraftState = { ...drive(major), pageId: 4, selections: { ...drive(major).selections, stage1: { choice: "Brat" }, stage3: { choice: "NAIS" }, stage4: { choice: "Tour" } } };
    // When
    const next = wizardReducer(state, { type: "back" });
    // Then
    expect(next.pageId).toBe(3);
    expect(next.selections).toEqual({ ...state.selections, stage3: null, stage4: null });
  });
});
