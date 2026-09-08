import type { BtccDraft, BtccRow } from "@/lib/btcc";
import {
  CHARACTER_START_XP,
  computeXp,
  type XpSummary,
  availableChildhoodModules,
  resolveChildhoodModule,
  applyChildhoodModule,
  type ChildhoodContext,
  type ChildhoodSelection,
  type ChildhoodResolution,
  resolveSibkoFields,
  type SibkoFieldsResult,
  flexCandidates,
  validateFlexAllocations,
  applyFlexAllocations,
  type FlexAllocation,
} from "@/lib/characters";
import { mergeRows } from "@/lib/characters/grants";
import { stage0Catalog, childhoodCatalog } from "@/lib/rules/load";
import type { ChildhoodModule } from "@/lib/rules/childhood-contract";
import type { Stage0Candidate, Stage0Layer } from "@/lib/rules/stage0-contract";
import {
  initializeWizardDraft,
  rebuildStage0,
  resolveStage0Candidates,
} from "./wizard-stage0";
import type {
  Stage0ChoiceSelection,
  Stage0LayerId,
  Stage0Selection,
  WizardBaseline,
} from "./wizard-stage0";

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
type ChildhoodStageKey = "stage1" | "stage2";
const laterStages = ["stage1", "stage2", "stage3", "stage4"] as const;
const emptyStage0: Stage0Selection = {
  affiliationId: null,
  subAffiliationId: null,
  casteId: null,
  startingLanguage: null,
  choices: [],
};

export function pageForStage(stage: StageKey): WizardPageId {
  return ({ stage0: 1, stage1: 2, stage2: 3, stage3: 4, stage4: 5 } as const)[
    stage
  ];
}
export function stageForPage(pageId: WizardPageId): StageKey | null {
  return ([null, "stage0", "stage1", "stage2", "stage3", "stage4"] as const)[
    pageId
  ];
}
export interface StageSelection {
  readonly choice: string;
}
export type Stage2Selection = ChildhoodSelection & {
  readonly flexGrants: readonly FlexAllocation[];
};
export type ChildhoodStageView = {
  readonly context: ChildhoodContext | null;
  readonly modules: readonly ChildhoodModule[];
  readonly resolution: ChildhoodResolution | null;
  readonly prefix: BtccDraft;
  readonly preFlexDraft: BtccDraft;
  readonly fields: SibkoFieldsResult | null;
  readonly flexTargets: readonly Stage0Candidate[];
};
export type Stage2Handoff = {
  readonly basicSkills: readonly BtccRow[];
  readonly advancedSkills: readonly BtccRow[];
  readonly rebateXp: number;
  readonly militaryField: boolean;
};
export interface WizardDraftState {
  readonly pageId: WizardPageId;
  /** Compatibility view for the shell; never independently stored. */
  readonly characterName: string;
  readonly draft: BtccDraft;
  readonly xp: XpSummary;
  readonly moduleXpSpent: number;
  readonly wizardXpRemaining: number;
  readonly stage0Complete: boolean;
  readonly stage1Complete: boolean;
  readonly stage2Complete: boolean;
  readonly stage2Handoff: Stage2Handoff | null;
  readonly childhood: Readonly<Record<ChildhoodStageKey, ChildhoodStageView>>;
  readonly selections: {
    readonly stage0: Stage0Selection;
    readonly stage1: ChildhoodSelection | null;
    readonly stage2: Stage2Selection | null;
    readonly stage3: StageSelection | null;
    readonly stage4: StageSelection | null;
  };
}
export type WizardAction =
  | { readonly type: "setName"; readonly name: string }
  | {
      readonly type: "select";
      readonly stage: "stage3" | "stage4";
      readonly choice: string;
    }
  | {
      readonly type: "setStageModule";
      readonly stage: ChildhoodStageKey;
      readonly moduleName: string | null;
    }
  | {
      readonly type: "setStageChoice";
      readonly stage: ChildhoodStageKey;
      readonly choiceId: string;
      readonly candidates: readonly Stage0Candidate[];
    }
  | { readonly type: "setStage1Phenotype"; readonly phenotype: string | null }
  | { readonly type: "setSibkoBranch"; readonly branch: string | null }
  | {
      readonly type: "setSibkoField";
      readonly pool: "basic" | "advanced";
      readonly groupId: string;
      readonly skill: string | null;
    }
  | {
      readonly type: "setStage2FlexGrant";
      readonly candidate: Stage0Candidate;
      readonly xp: number;
    }
  | { readonly type: "resetStage2Flex" }
  | {
      readonly type: "setStage0Affiliation";
      readonly affiliationId: number | null;
    }
  | {
      readonly type: "setStage0SubAffiliation";
      readonly subAffiliationId: number | null;
    }
  | { readonly type: "setStage0Caste"; readonly casteId: string | null }
  | {
      readonly type: "setStage0StartingLanguage";
      readonly startingLanguage: string | null;
    }
  | ({ readonly type: "setStage0Choice" } & Stage0ChoiceSelection)
  | { readonly type: "next" }
  | { readonly type: "back" };

function assertNever(value: never): never {
  throw new TypeError(`Unexpected wizard variant: ${String(value)}`);
}
function withNameView(
  state: Omit<WizardDraftState, "characterName">,
): WizardDraftState {
  return {
    ...state,
    get characterName() {
      return this.draft.scalars.name;
    },
  };
}
export function initialWizardState(): WizardDraftState {
  const draft = initializeWizardDraft({ characterName: "" });
  const emptyView: ChildhoodStageView = {
    context: null,
    modules: [],
    resolution: null,
    prefix: draft,
    preFlexDraft: draft,
    fields: null,
    flexTargets: [],
  };
  return withNameView({
    pageId: 0,
    draft,
    xp: computeXp(draft),
    moduleXpSpent: 0,
    wizardXpRemaining: CHARACTER_START_XP,
    stage0Complete: false,
    stage1Complete: false,
    stage2Complete: false,
    stage2Handoff: null,
    childhood: { stage1: emptyView, stage2: emptyView },
    selections: {
      stage0: emptyStage0,
      stage1: null,
      stage2: null,
      stage3: null,
      stage4: null,
    },
  });
}
function sameCandidate(a: Stage0Candidate, b: Stage0Candidate): boolean {
  return a.kind === b.kind && a.value === b.value;
}
function selectedLayers(selection: Stage0Selection) {
  const affiliation = stage0Catalog.affiliations.find(
    (entry) => entry.id === selection.affiliationId,
  );
  const child = affiliation?.subAffiliations.find(
    (entry) =>
      entry.id === selection.subAffiliationId &&
      entry.affiliationId === affiliation.id,
  );
  const caste = stage0Catalog.castes.find(
    (entry) => entry.name === selection.casteId,
  );
  return [
    { id: "base", layer: affiliation?.base },
    { id: "subAffiliation", layer: child?.layer },
    { id: "caste", layer: caste?.layer },
  ] satisfies readonly {
    readonly id: Stage0LayerId;
    readonly layer: Stage0Layer | undefined;
  }[];
}
function pruneChoices(selection: Stage0Selection): Stage0Selection {
  // Catalog order is dependency order: later choices may reference earlier picks.
  const choices: Stage0ChoiceSelection[] = [];
  for (const { id, layer } of selectedLayers(selection)) {
    for (const choice of layer?.choices ?? []) {
      const pick = selection.choices.find(
        (entry) => entry.layer === id && entry.choiceId === choice.id,
      );
      if (!pick) continue;
      const allowed = resolveStage0Candidates(choice, id, {
        ...selection,
        choices,
      });
      const candidates = pick.candidates.filter((candidate) =>
        allowed.some((entry) => sameCandidate(entry, candidate)),
      );
      choices.push({ ...pick, candidates });
    }
  }
  return { ...selection, choices };
}
function project(
  state: WizardDraftState,
  selections = state.selections,
  baseline: WizardBaseline = { characterName: state.draft.scalars.name },
): WizardDraftState | null {
  const result = rebuildStage0(baseline, stage0Catalog, selections.stage0);
  if (result.status === "invalid") return null;
  let draft =
    result.status === "complete"
      ? result.draft
      : initializeWizardDraft(baseline);
  let spent = result.status === "complete" ? result.moduleXpSpent : 0;
  let prefixComplete = result.status === "complete";
  let stage1Complete = false;
  let stage2Complete = false;
  let stage2Handoff: Stage2Handoff | null = null;
  const views = {} as Record<ChildhoodStageKey, ChildhoodStageView>;
  const affiliation = stage0Catalog.affiliations.find(
    (entry) => entry.id === selections.stage0.affiliationId,
  );
  const child = affiliation?.subAffiliations.find(
    (entry) => entry.id === selections.stage0.subAffiliationId,
  );
  for (const stage of ["stage1", "stage2"] as const) {
    const prefix = draft;
    const context: ChildhoodContext | null =
      prefixComplete &&
      affiliation &&
      child &&
      selections.stage0.startingLanguage
        ? {
            affiliation: affiliation.name,
            subAffiliationId: child.id,
            subAffiliation: child.name,
            caste: selections.stage0.casteId,
            startingLanguage: selections.stage0.startingLanguage,
            stage1Module:
              stage === "stage2"
                ? (selections.stage1?.moduleName ?? null)
                : null,
            traits: prefix.traits,
          }
        : null;
    const selection = selections[stage];
    const number = stage === "stage1" ? 1 : 2;
    const modules = context
      ? availableChildhoodModules(childhoodCatalog, number, context)
      : [];
    const resolution =
      selection && context
        ? resolveChildhoodModule(childhoodCatalog, number, selection, context)
        : null;
    if (resolution?.status === "invalid") return null;
    let fields: SibkoFieldsResult | null = null;
    let preFlexDraft = prefix;
    let flexTargets: readonly Stage0Candidate[] = [];
    if (selection && resolution?.status === "complete") {
      preFlexDraft = applyChildhoodModule(prefix, resolution.module, selection);
      if (resolution.module.sibkoPools && selection.sibko) {
        fields = resolveSibkoFields(
          resolution.module.sibkoPools.basic,
          resolution.module.sibkoPools.advanced,
          selection.sibko,
        );
        if (fields.status === "invalid") return null;
        preFlexDraft = {
          ...preFlexDraft,
          skills: mergeRows(
            preFlexDraft.skills,
            [...fields.basicSkills, ...fields.advancedSkills],
            (a, b) => a + b,
          ).filter((row) => row.xp !== 0),
        };
        stage2Handoff = {
          basicSkills: fields.basicSkills,
          advancedSkills: fields.advancedSkills,
          rebateXp: fields.rebateXp,
          militaryField: selection.moduleName === "Trueborn Sibko",
        };
      }
      draft = preFlexDraft;
      if (
        stage === "stage2" &&
        selections.stage2 &&
        resolution.module.flexPolicy
      ) {
        flexTargets = flexCandidates(preFlexDraft);
        const validation = validateFlexAllocations(
          resolution.module.flexPolicy,
          selections.stage2.flexGrants,
          flexTargets,
        );
        if (!validation.valid) return null;
        draft = applyFlexAllocations(
          preFlexDraft,
          selections.stage2.flexGrants,
        );
      }
      spent += resolution.module.xpCost;
      if (stage === "stage1") stage1Complete = true;
      else stage2Complete = true;
    } else prefixComplete = false;
    views[stage] = {
      context,
      modules,
      resolution,
      prefix,
      preFlexDraft,
      fields,
      flexTargets,
    };
  }
  return withNameView({
    ...state,
    selections,
    draft,
    xp: computeXp(draft),
    moduleXpSpent: spent,
    wizardXpRemaining:
      CHARACTER_START_XP -
      spent +
      (state.pageId >= 4 ? (stage2Handoff?.rebateXp ?? 0) : 0),
    stage0Complete: result.status === "complete",
    stage1Complete,
    stage2Complete,
    stage2Handoff,
    childhood: views,
  });
}

function rebuild(
  state: WizardDraftState,
  selection: Stage0Selection,
): WizardDraftState {
  return (
    project(state, {
      stage0: selection,
      stage1: null,
      stage2: null,
      stage3: null,
      stage4: null,
    }) ?? state
  );
}

export function canAdvance(state: WizardDraftState): boolean {
  if (state.pageId === 1) return state.stage0Complete;
  if (state.pageId === 2) return state.stage1Complete;
  if (state.pageId === 3) return state.stage2Complete;
  return state.pageId < 5;
}

function updateChildhood(
  state: WizardDraftState,
  stage: ChildhoodStageKey,
  selection: ChildhoodSelection | Stage2Selection | null,
): WizardDraftState {
  if (state.pageId !== pageForStage(stage) || !state.childhood[stage].context)
    return state;
  const selections =
    stage === "stage1"
      ? {
          ...state.selections,
          stage1: selection,
          stage2: null,
          stage3: null,
          stage4: null,
        }
      : {
          ...state.selections,
          stage2: selection as Stage2Selection | null,
          stage3: null,
          stage4: null,
        };
  // Rebuild without owned flex first: stale raw rows cannot authorize their own allocation.
  if (stage === "stage2" && selections.stage2) {
    const retained = selections.stage2.flexGrants;
    selections.stage2 = { ...selections.stage2, flexGrants: [] };
    const fixed = project(state, selections);
    if (!fixed) return state;
    if (fixed.stage2Complete) {
      const view = fixed.childhood.stage2;
      const allocations = retained.filter((allocation) =>
        view.flexTargets.some((candidate) =>
          sameCandidate(candidate, allocation.candidate),
        ),
      );
      selections.stage2 = { ...selections.stage2, flexGrants: allocations };
    }
  }
  return project(state, selections) ?? state;
}

export function wizardReducer(
  state: WizardDraftState,
  action: WizardAction,
): WizardDraftState {
  const selection = state.selections.stage0;
  const affiliation = stage0Catalog.affiliations.find(
    (entry) => entry.id === selection.affiliationId,
  );
  const child = affiliation?.subAffiliations.find(
    (entry) =>
      entry.id === selection.subAffiliationId &&
      entry.affiliationId === affiliation.id,
  );
  switch (action.type) {
    case "setName":
      return action.name === state.draft.scalars.name
        ? state
        : (project(state, state.selections, { characterName: action.name }) ??
            state);
    case "setStage0Affiliation": {
      if (action.affiliationId === selection.affiliationId) return state;
      if (
        action.affiliationId !== null &&
        !stage0Catalog.affiliations.some(
          (entry) => entry.id === action.affiliationId,
        )
      )
        return state;
      return rebuild(state, {
        ...emptyStage0,
        affiliationId: action.affiliationId,
      });
    }
    case "setStage0SubAffiliation": {
      if (action.subAffiliationId === selection.subAffiliationId) return state;
      const nextChild = affiliation?.subAffiliations.find(
        (entry) =>
          entry.id === action.subAffiliationId &&
          entry.affiliationId === affiliation.id,
      );
      if (action.subAffiliationId !== null && !nextChild) return state;
      const castes = nextChild?.castes ?? affiliation?.castes ?? [];
      const languages =
        nextChild?.startingLanguages ?? affiliation?.startingLanguages;
      const casteId =
        nextChild &&
        selection.casteId !== null &&
        castes.includes(selection.casteId)
          ? selection.casteId
          : null;
      const startingLanguage =
        nextChild &&
        languages?.mode === "base" &&
        selection.startingLanguage !== null &&
        languages.candidates.includes(selection.startingLanguage)
          ? selection.startingLanguage
          : null;
      return rebuild(
        state,
        pruneChoices({
          ...selection,
          subAffiliationId: action.subAffiliationId,
          casteId,
          startingLanguage,
          choices: selection.choices.filter(
            (pick) =>
              pick.layer !== "subAffiliation" &&
              (pick.layer !== "caste" || casteId === selection.casteId),
          ),
        }),
      );
    }
    case "setStage0Caste": {
      if (action.casteId === selection.casteId) return state;
      if (
        action.casteId !== null &&
        (!affiliation?.casteRequired ||
          !child ||
          !(child.castes ?? affiliation.castes).includes(action.casteId) ||
          !stage0Catalog.castes.some((entry) => entry.name === action.casteId))
      )
        return state;
      return rebuild(
        state,
        pruneChoices({
          ...selection,
          casteId: action.casteId,
          choices: selection.choices.filter((pick) => pick.layer !== "caste"),
        }),
      );
    }
    case "setStage0StartingLanguage": {
      if (action.startingLanguage === selection.startingLanguage) return state;
      const languages =
        child?.startingLanguages ?? affiliation?.startingLanguages;
      if (
        action.startingLanguage !== null &&
        (!child ||
          languages?.mode !== "base" ||
          !languages.candidates.includes(action.startingLanguage))
      )
        return state;
      return rebuild(
        state,
        pruneChoices({
          ...selection,
          startingLanguage: action.startingLanguage,
        }),
      );
    }
    case "setStage0Choice": {
      const choice = selectedLayers(selection)
        .find((entry) => entry.id === action.layer)
        ?.layer?.choices.find((entry) => entry.id === action.choiceId);
      if (!choice || action.candidates.length > choice.selectionCount)
        return state;
      const allowed = resolveStage0Candidates(choice, action.layer, selection);
      if (
        action.candidates.some(
          (candidate, index) =>
            !allowed.some((entry) => sameCandidate(entry, candidate)) ||
            (choice.unique &&
              action.candidates
                .slice(0, index)
                .some((entry) => sameCandidate(entry, candidate))),
        )
      )
        return state;
      const previous = selection.choices.find(
        (pick) =>
          pick.layer === action.layer && pick.choiceId === action.choiceId,
      );
      if (
        previous &&
        previous.candidates.length === action.candidates.length &&
        previous.candidates.every((candidate, index) =>
          sameCandidate(candidate, action.candidates[index]),
        )
      )
        return state;
      const pick: Stage0ChoiceSelection = {
        layer: action.layer,
        choiceId: action.choiceId,
        candidates: action.candidates.map((candidate) => ({ ...candidate })),
      };
      return rebuild(
        state,
        pruneChoices({
          ...selection,
          choices: [
            ...selection.choices.filter((entry) => entry !== previous),
            pick,
          ],
        }),
      );
    }
    case "setStageModule": {
      if (state.pageId !== pageForStage(action.stage)) return state;
      const previous = state.selections[action.stage];
      if ((previous?.moduleName ?? null) === action.moduleName) return state;
      if (action.moduleName === null)
        return updateChildhood(state, action.stage, null);
      const ruleModule = state.childhood[action.stage].modules.find(
        (entry) => entry.name === action.moduleName,
      );
      if (!ruleModule) return state;
      const next: ChildhoodSelection = {
        moduleName: ruleModule.name,
        choices: [],
        phenotype: null,
        sibko: ruleModule.sibkoBranches.length
          ? { branch: null, basic: [], advanced: [] }
          : null,
      };
      return updateChildhood(
        state,
        action.stage,
        action.stage === "stage2" ? { ...next, flexGrants: [] } : next,
      );
    }
    case "setStageChoice": {
      const previous = state.selections[action.stage];
      if (!previous || state.pageId !== pageForStage(action.stage))
        return state;
      const resolution = state.childhood[action.stage].resolution;
      if (
        !resolution ||
        resolution.status === "invalid" ||
        !resolution.module?.layer.choices.some(
          (choice) => choice.id === action.choiceId,
        )
      )
        return state;
      const prior = previous.choices.find(
        (choice) => choice.choiceId === action.choiceId,
      );
      if (
        prior &&
        prior.candidates.length === action.candidates.length &&
        prior.candidates.every((candidate, index) =>
          sameCandidate(candidate, action.candidates[index]),
        )
      )
        return state;
      return updateChildhood(state, action.stage, {
        ...previous,
        choices: [
          ...previous.choices.filter(
            (choice) => choice.choiceId !== action.choiceId,
          ),
          {
            choiceId: action.choiceId,
            candidates: action.candidates.map((candidate) => ({
              ...candidate,
            })),
          },
        ],
      });
    }
    case "setStage1Phenotype": {
      const previous = state.selections.stage1;
      if (!previous || previous.phenotype === action.phenotype) return state;
      return updateChildhood(state, "stage1", {
        ...previous,
        phenotype: action.phenotype,
      });
    }
    case "setSibkoBranch": {
      const previous = state.selections.stage2;
      if (!previous?.sibko || previous.sibko.branch === action.branch)
        return state;
      return updateChildhood(state, "stage2", {
        ...previous,
        sibko: { branch: action.branch, basic: [], advanced: [] },
        flexGrants: [],
      });
    }
    case "setSibkoField": {
      const previous = state.selections.stage2;
      const resolution = state.childhood.stage2.resolution;
      if (
        !previous?.sibko ||
        resolution?.status !== "complete" ||
        !resolution.module.sibkoPools
      )
        return state;
      const pool = resolution.module.sibkoPools[action.pool];
      const group = pool.groups.find((entry) => entry.id === action.groupId);
      if (
        !group ||
        (action.skill !== null && !group.skills.includes(action.skill))
      )
        return state;
      const prior = previous.sibko[action.pool].find(
        (entry) => entry.groupId === action.groupId,
      );
      if ((prior?.skill ?? null) === action.skill) return state;
      const choices = previous.sibko[action.pool].filter(
        (entry) => entry.groupId !== action.groupId,
      );
      if (action.skill !== null)
        choices.push({ groupId: action.groupId, skill: action.skill });
      return updateChildhood(state, "stage2", {
        ...previous,
        sibko: { ...previous.sibko, [action.pool]: choices },
      });
    }
    case "setStage2FlexGrant": {
      const previous = state.selections.stage2;
      const view = state.childhood.stage2;
      if (
        state.pageId !== 3 ||
        !previous ||
        view.resolution?.status !== "complete" ||
        !view.resolution.module.flexPolicy
      )
        return state;
      const prior = previous.flexGrants.find((entry) =>
        sameCandidate(entry.candidate, action.candidate),
      );
      if ((prior?.xp ?? 0) === action.xp) return state;
      const flexGrants = previous.flexGrants.filter((entry) => entry !== prior);
      if (action.xp !== 0)
        flexGrants.push({ candidate: { ...action.candidate }, xp: action.xp });
      if (
        !validateFlexAllocations(
          view.resolution.module.flexPolicy,
          flexGrants,
          view.flexTargets,
        ).valid
      )
        return state;
      return (
        project(state, {
          ...state.selections,
          stage2: { ...previous, flexGrants },
        }) ?? state
      );
    }
    case "resetStage2Flex": {
      const previous = state.selections.stage2;
      if (state.pageId !== 3 || !previous?.flexGrants.length) return state;
      return (
        project(state, {
          ...state.selections,
          stage2: { ...previous, flexGrants: [] },
        }) ?? state
      );
    }
    case "select":
      return withNameView({
        ...state,
        selections: {
          ...state.selections,
          [action.stage]: { choice: action.choice },
        },
      });
    case "next": {
      if (!canAdvance(state)) return state;
      const page = WIZARD_PAGES[state.pageId + 1];
      return page
        ? (project(withNameView({ ...state, pageId: page.id })) ?? state)
        : state;
    }
    case "back": {
      if (state.pageId === 0) return state;
      const selections = { ...state.selections };
      for (const stage of laterStages)
        if (pageForStage(stage) >= state.pageId) selections[stage] = null;
      const previousPage = WIZARD_PAGES[state.pageId - 1];
      const next = withNameView({
        ...state,
        pageId: previousPage.id,
        selections,
      });
      // Unlike desktop §9.6, returning to Intro also unwinds Stage 0.
      return state.pageId === 1
        ? rebuild(next, emptyStage0)
        : (project(next) ?? state);
    }
    default:
      return assertNever(action);
  }
}
