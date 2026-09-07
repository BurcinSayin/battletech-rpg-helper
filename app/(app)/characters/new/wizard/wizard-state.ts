// The lifepath wizard's navigation state machine — the shell behind step #12a.
//
// Page topology and back-navigation semantics are ported from the desktop
// app's `Wizard` (a `QWizard` subclass), documented in `docs/RULES.md` §7.
// Two citations matter most here:
//
// - §7.1 — six pages, ids assigned by declaration order in `wizard.ui`:
//   0 Intro, 1 Stage 0 (Affiliation), 2 Stage 1 (Early Childhood),
//   3 Stage 2 (Late Childhood), 4 Stage 3 (School), 5 Stage 4 (Real Life).
// - §7.3 — back-navigation discards the stage being left. The desktop's
//   `BackChange()` (`wizard.cpp:155-191`) runs *after* `QWizard::back()`, so
//   its switch sees the destination page id, and each case unwinds the stage
//   that was just exited.
//
// Deliberate divergence (§9.6): the desktop has no `case 0` — backing out of
// Stage 0 to the Intro page unwinds nothing, and no `S0RemoveOldParam()`
// exists in the tree. The port closes that hole: `back` from page 1 discards
// Stage 0's selection exactly like every other stage.

/** The six wizard pages in `wizard.ui` declaration order (`RULES.md` §7.1). */
export const WIZARD_PAGES = [
  { id: 0, key: "intro", title: "Intro" },
  { id: 1, key: "stage0", title: "Stage 0 — Affiliation" },
  { id: 2, key: "stage1", title: "Stage 1 — Early Childhood" },
  { id: 3, key: "stage2", title: "Stage 2 — Late Childhood" },
  { id: 4, key: "stage3", title: "Stage 3 — School" },
  { id: 5, key: "stage4", title: "Stage 4 — Real Life" },
] as const;

/** Page ids match `QWizard` declaration order, 0–5 (`RULES.md` §7.1). */
export type WizardPageId = (typeof WIZARD_PAGES)[number]["id"];

/** The five lifepath stages; page id N (1–5) hosts stage key `stage${N - 1}`. */
export type StageKey = `stage${0 | 1 | 2 | 3 | 4}`;

/** The stage page hosting `stage` (Intro, id 0, is not a stage). */
export function pageForStage(stage: StageKey): WizardPageId {
  return (Number(stage.slice("stage".length)) + 1) as WizardPageId;
}

/** The stage hosted on `pageId`, or `null` for the Intro page (id 0). */
export function stageForPage(pageId: WizardPageId): StageKey | null {
  return pageId === 0 ? null : (`stage${pageId - 1}` as StageKey);
}

/**
 * A committed choice on one stage page. The shell records only the chosen
 * option's name; steps #12b–#14 widen this per stage (affiliation picks,
 * module grants, flex XP, Stage 4 repeats).
 */
export interface StageSelection {
  readonly choice: string;
}

export interface WizardDraftState {
  readonly pageId: WizardPageId;
  /** Intro-page input. Intro state is never discarded by back-navigation —
   *  only stage selections are (§7.3). */
  readonly characterName: string;
  /** Per-stage committed choices; `null` while a stage is unchosen. */
  readonly selections: Readonly<Record<StageKey, StageSelection | null>>;
}

export type WizardAction =
  | { readonly type: "setName"; readonly name: string }
  | {
      readonly type: "select";
      readonly stage: StageKey;
      readonly choice: string;
    }
  | { readonly type: "next" }
  | { readonly type: "back" };

export function initialWizardState(): WizardDraftState {
  return {
    pageId: 0,
    characterName: "",
    selections: {
      stage0: null,
      stage1: null,
      stage2: null,
      stage3: null,
      stage4: null,
    },
  };
}

export function wizardReducer(
  state: WizardDraftState,
  action: WizardAction,
): WizardDraftState {
  switch (action.type) {
    case "setName":
      return { ...state, characterName: action.name };
    case "select":
      return {
        ...state,
        selections: {
          ...state.selections,
          [action.stage]: { choice: action.choice },
        },
      };
    case "next":
      // Completion (page 5 → Finish) is step #14c, so `next` stops at the
      // last page. Whether an unchosen stage may be walked past (§7.2
      // skippability) is enforced by the stage content steps, not the shell.
      return state.pageId < 5
        ? { ...state, pageId: (state.pageId + 1) as WizardPageId }
        : state;
    case "back": {
      if (state.pageId === 0) return state;
      const left = stageForPage(state.pageId);
      const selections = { ...state.selections };
      if (left) {
        // Discard the stage being left and anything after it — the desktop's
        // confirmation text: "all selections you have already made for any
        // later stages are lost" (`wizard.cpp:196`). Later stages are already
        // null under sequential navigation, so this is belt-and-braces that
        // keeps the invariant literal. `left` includes stage0 — the §9.6
        // divergence: backing out of Stage 0 unwinds it, unlike the desktop.
        for (const page of WIZARD_PAGES) {
          const key = stageForPage(page.id);
          if (key && page.id >= pageForStage(left)) selections[key] = null;
        }
      }
      return {
        ...state,
        pageId: (state.pageId - 1) as WizardPageId,
        selections,
      };
    }
  }
}
