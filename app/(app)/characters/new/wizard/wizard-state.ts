import type { BtccDraft } from "@/lib/btcc";
import { CHARACTER_START_XP, computeXp, type XpSummary } from "@/lib/characters";
import { stage0Catalog } from "@/lib/rules/load";
import type { Stage0Candidate, Stage0Layer } from "@/lib/rules/stage0-contract";
import { initializeWizardDraft, rebuildStage0, resolveStage0Candidates } from "./wizard-stage0";
import type { Stage0ChoiceSelection, Stage0LayerId, Stage0Selection, WizardBaseline } from "./wizard-stage0";

/** Page ids match wizard.ui declaration order (RULES.md §7.1). */
export const WIZARD_PAGES = [
  { id: 0, key: "intro", title: "Intro" },
  { id: 1, key: "stage0", title: "Stage 0 — Affiliation" },
  { id: 2, key: "stage1", title: "Stage 1 — Early Childhood" },
  { id: 3, key: "stage2", title: "Stage 2 — Late Childhood" },
  { id: 4, key: "stage3", title: "Stage 3 — School" },
  { id: 5, key: "stage4", title: "Stage 4 — Real Life" },
] as const;
export type WizardPageId = (typeof WIZARD_PAGES)[number]["id"];
export type StageKey = `stage${0 | 1 | 2 | 3 | 4}`;
type LaterStageKey = Exclude<StageKey, "stage0">;
const laterStages = ["stage1", "stage2", "stage3", "stage4"] as const;
const emptyStage0: Stage0Selection = { affiliationId: null, subAffiliationId: null, casteId: null, startingLanguage: null, choices: [] };

export function pageForStage(stage: StageKey): WizardPageId {
  return ({ stage0: 1, stage1: 2, stage2: 3, stage3: 4, stage4: 5 } as const)[stage];
}
export function stageForPage(pageId: WizardPageId): StageKey | null {
  return ([null, "stage0", "stage1", "stage2", "stage3", "stage4"] as const)[pageId];
}
export interface StageSelection { readonly choice: string }
export interface WizardDraftState {
  readonly pageId: WizardPageId;
  /** Compatibility view for the shell; never independently stored. */
  readonly characterName: string;
  readonly draft: BtccDraft;
  readonly xp: XpSummary;
  readonly moduleXpSpent: number;
  readonly wizardXpRemaining: number;
  readonly stage0Complete: boolean;
  readonly selections: Readonly<Record<LaterStageKey, StageSelection | null>> & { readonly stage0: Stage0Selection };
}
export type WizardAction =
  | { readonly type: "setName"; readonly name: string }
  | { readonly type: "select"; readonly stage: LaterStageKey; readonly choice: string }
  | { readonly type: "setStage0Affiliation"; readonly affiliationId: number | null }
  | { readonly type: "setStage0SubAffiliation"; readonly subAffiliationId: number | null }
  | { readonly type: "setStage0Caste"; readonly casteId: string | null }
  | { readonly type: "setStage0StartingLanguage"; readonly startingLanguage: string | null }
  | ({ readonly type: "setStage0Choice" } & Stage0ChoiceSelection)
  | { readonly type: "next" }
  | { readonly type: "back" };

function assertNever(value: never): never {
  throw new TypeError(`Unexpected wizard variant: ${String(value)}`);
}
function withNameView(state: Omit<WizardDraftState, "characterName">): WizardDraftState {
  return { ...state, get characterName() { return this.draft.scalars.name; } };
}
export function initialWizardState(): WizardDraftState {
  const draft = initializeWizardDraft({ characterName: "" });
  return withNameView({ pageId: 0, draft, xp: computeXp(draft), moduleXpSpent: 0, wizardXpRemaining: CHARACTER_START_XP, stage0Complete: false,
    selections: { stage0: emptyStage0, stage1: null, stage2: null, stage3: null, stage4: null } });
}
function sameCandidate(a: Stage0Candidate, b: Stage0Candidate): boolean {
  return a.kind === b.kind && a.value === b.value;
}
function selectedLayers(selection: Stage0Selection) {
  const affiliation = stage0Catalog.affiliations.find((entry) => entry.id === selection.affiliationId);
  const child = affiliation?.subAffiliations.find((entry) => entry.id === selection.subAffiliationId && entry.affiliationId === affiliation.id);
  const caste = stage0Catalog.castes.find((entry) => entry.name === selection.casteId);
  return [
    { id: "base", layer: affiliation?.base },
    { id: "subAffiliation", layer: child?.layer },
    { id: "caste", layer: caste?.layer },
  ] satisfies readonly { readonly id: Stage0LayerId; readonly layer: Stage0Layer | undefined }[];
}
function pruneChoices(selection: Stage0Selection): Stage0Selection {
  // Catalog order is dependency order: later choices may reference earlier picks.
  const choices: Stage0ChoiceSelection[] = [];
  for (const { id, layer } of selectedLayers(selection)) {
    for (const choice of layer?.choices ?? []) {
      const pick = selection.choices.find((entry) => entry.layer === id && entry.choiceId === choice.id);
      if (!pick) continue;
      const allowed = resolveStage0Candidates(choice, id, { ...selection, choices });
      const candidates = pick.candidates.filter((candidate) => allowed.some((entry) => sameCandidate(entry, candidate)));
      choices.push({ ...pick, candidates });
    }
  }
  return { ...selection, choices };
}
function rebuild(state: WizardDraftState, selection: Stage0Selection, baseline: WizardBaseline = { characterName: state.draft.scalars.name }): WizardDraftState {
  const result = rebuildStage0(baseline, stage0Catalog, selection);
  switch (result.status) {
    case "invalid": return state;
    case "incomplete": {
      const draft = initializeWizardDraft(baseline);
      return withNameView({ ...state, selections: { ...state.selections, stage0: selection }, draft, xp: computeXp(draft), moduleXpSpent: 0, wizardXpRemaining: CHARACTER_START_XP, stage0Complete: false });
    }
    case "complete": return withNameView({ ...state, selections: { ...state.selections, stage0: selection }, draft: result.draft, xp: result.xp, moduleXpSpent: result.moduleXpSpent, wizardXpRemaining: result.wizardXpRemaining, stage0Complete: true });
    default: return assertNever(result);
  }
}

export function wizardReducer(state: WizardDraftState, action: WizardAction): WizardDraftState {
  const selection = state.selections.stage0;
  const affiliation = stage0Catalog.affiliations.find((entry) => entry.id === selection.affiliationId);
  const child = affiliation?.subAffiliations.find((entry) => entry.id === selection.subAffiliationId && entry.affiliationId === affiliation.id);
  switch (action.type) {
    case "setName": return action.name === state.draft.scalars.name ? state : rebuild(state, selection, { characterName: action.name });
    case "setStage0Affiliation": {
      if (action.affiliationId === selection.affiliationId) return state;
      if (action.affiliationId !== null && !stage0Catalog.affiliations.some((entry) => entry.id === action.affiliationId)) return state;
      return rebuild(state, { ...emptyStage0, affiliationId: action.affiliationId });
    }
    case "setStage0SubAffiliation": {
      if (action.subAffiliationId === selection.subAffiliationId) return state;
      const nextChild = affiliation?.subAffiliations.find((entry) => entry.id === action.subAffiliationId && entry.affiliationId === affiliation.id);
      if (action.subAffiliationId !== null && !nextChild) return state;
      const castes = nextChild?.castes ?? affiliation?.castes ?? [];
      const languages = nextChild?.startingLanguages ?? affiliation?.startingLanguages;
      const casteId = nextChild && selection.casteId !== null && castes.includes(selection.casteId) ? selection.casteId : null;
      const startingLanguage = nextChild && languages?.mode === "base" && selection.startingLanguage !== null && languages.candidates.includes(selection.startingLanguage) ? selection.startingLanguage : null;
      return rebuild(state, pruneChoices({ ...selection, subAffiliationId: action.subAffiliationId, casteId, startingLanguage,
        choices: selection.choices.filter((pick) => pick.layer !== "subAffiliation" && (pick.layer !== "caste" || casteId === selection.casteId)) }));
    }
    case "setStage0Caste": {
      if (action.casteId === selection.casteId) return state;
      if (action.casteId !== null && (!affiliation?.casteRequired || !child || !(child.castes ?? affiliation.castes).includes(action.casteId) || !stage0Catalog.castes.some((entry) => entry.name === action.casteId))) return state;
      return rebuild(state, pruneChoices({ ...selection, casteId: action.casteId, choices: selection.choices.filter((pick) => pick.layer !== "caste") }));
    }
    case "setStage0StartingLanguage": {
      if (action.startingLanguage === selection.startingLanguage) return state;
      const languages = child?.startingLanguages ?? affiliation?.startingLanguages;
      if (action.startingLanguage !== null && (!child || languages?.mode !== "base" || !languages.candidates.includes(action.startingLanguage))) return state;
      return rebuild(state, pruneChoices({ ...selection, startingLanguage: action.startingLanguage }));
    }
    case "setStage0Choice": {
      const choice = selectedLayers(selection).find((entry) => entry.id === action.layer)?.layer?.choices.find((entry) => entry.id === action.choiceId);
      if (!choice || action.candidates.length > choice.selectionCount) return state;
      const allowed = resolveStage0Candidates(choice, action.layer, selection);
      if (action.candidates.some((candidate, index) => !allowed.some((entry) => sameCandidate(entry, candidate)) || (choice.unique && action.candidates.slice(0, index).some((entry) => sameCandidate(entry, candidate))))) return state;
      const previous = selection.choices.find((pick) => pick.layer === action.layer && pick.choiceId === action.choiceId);
      if (previous && previous.candidates.length === action.candidates.length && previous.candidates.every((candidate, index) => sameCandidate(candidate, action.candidates[index]))) return state;
      const pick: Stage0ChoiceSelection = { layer: action.layer, choiceId: action.choiceId, candidates: action.candidates.map((candidate) => ({ ...candidate })) };
      return rebuild(state, pruneChoices({ ...selection, choices: [...selection.choices.filter((entry) => entry !== previous), pick] }));
    }
    case "select": return withNameView({ ...state, selections: { ...state.selections, [action.stage]: { choice: action.choice } } });
    case "next": {
      if (state.pageId === 1 && !state.stage0Complete) return state;
      const page = WIZARD_PAGES[state.pageId + 1];
      return page ? withNameView({ ...state, pageId: page.id }) : state;
    }
    case "back": {
      if (state.pageId === 0) return state;
      const selections = { ...state.selections };
      for (const stage of laterStages) if (pageForStage(stage) >= state.pageId) selections[stage] = null;
      const previousPage = WIZARD_PAGES[state.pageId - 1];
      const next = withNameView({ ...state, pageId: previousPage.id, selections });
      // Unlike desktop §9.6, returning to Intro also unwinds Stage 0.
      return state.pageId === 1 ? rebuild(next, emptyStage0) : next;
    }
    default: return assertNever(action);
  }
}
