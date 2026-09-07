import { describe, it, expect } from "vitest";
import {
  WIZARD_PAGES,
  initialWizardState,
  pageForStage,
  stageForPage,
  wizardReducer,
  type WizardDraftState,
} from "./wizard-state";

function walkBack(state: WizardDraftState): WizardDraftState {
  return wizardReducer(state, { type: "back" });
}

describe("WIZARD_PAGES", () => {
  it("matches the §7.1 topology: six pages, ids by declaration order", () => {
    expect(WIZARD_PAGES.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(WIZARD_PAGES.map((p) => p.key)).toEqual([
      "intro",
      "stage0",
      "stage1",
      "stage2",
      "stage3",
      "stage4",
    ]);
    // §7.1's id → stage mapping, confirmed by the `wizard.cpp:113-127` dispatch.
    expect(stageForPage(0)).toBeNull();
    expect(pageForStage("stage0")).toBe(1);
    expect(pageForStage("stage4")).toBe(5);
  });
});

describe("wizardReducer navigation", () => {
  it("walks forward from Intro to Stage 4 and stops there", () => {
    let state = initialWizardState();
    expect(state.pageId).toBe(0);
    for (let i = 0; i < 6; i++) state = wizardReducer(state, { type: "next" });
    // Six `next` presses from page 0: the fifth reaches page 5, the sixth is
    // a no-op — completion (Finish) is step #14c.
    expect(state.pageId).toBe(5);
  });

  it("back from Intro is a no-op", () => {
    const state = initialWizardState();
    expect(walkBack(state)).toBe(state);
  });

  it("keeps the Intro-page name through back-navigation", () => {
    let state = wizardReducer(initialWizardState(), {
      type: "setName",
      name: "Lisa",
    });
    state = wizardReducer(state, { type: "next" });
    state = walkBack(state);
    expect(state.pageId).toBe(0);
    expect(state.characterName).toBe("Lisa");
  });
});

describe("wizardReducer back-navigation discards (§7.3)", () => {
  it("discards the stage being left and keeps earlier stages", () => {
    let state = initialWizardState();
    for (const [stage, choice] of [
      ["stage0", "Inner Sphere"],
      ["stage1", "Born Mercenary Brat"],
      ["stage2", "Military School"],
    ] as const) {
      state = wizardReducer(state, { type: "next" });
      state = wizardReducer(state, { type: "select", stage, choice });
    }
    expect(state.pageId).toBe(3);

    // Back to page 2 (Stage 1): Stage 2's choice is discarded
    // (`S2RemoveOldParam`, `wizard.cpp:164-172`), Stages 0–1 survive.
    state = walkBack(state);
    expect(state.pageId).toBe(2);
    expect(state.selections.stage2).toBeNull();
    expect(state.selections.stage1?.choice).toBe("Born Mercenary Brat");
    expect(state.selections.stage0?.choice).toBe("Inner Sphere");

    // Back to page 1 (Stage 0): Stage 1's choice goes too.
    state = walkBack(state);
    expect(state.pageId).toBe(1);
    expect(state.selections.stage1).toBeNull();
    expect(state.selections.stage0?.choice).toBe("Inner Sphere");
  });

  it("discards Stage 0 when backing out to Intro — the §9.6 divergence", () => {
    // The desktop has no `case 0` in `BackChange()` and no
    // `S0RemoveOldParam()`, so its Stage 0 grants survive a return to Intro.
    // The port deliberately does not reproduce that defect.
    let state = wizardReducer(initialWizardState(), { type: "next" });
    state = wizardReducer(state, {
      type: "select",
      stage: "stage0",
      choice: "Clan Wolf",
    });

    state = walkBack(state);
    expect(state.pageId).toBe(0);
    expect(state.selections.stage0).toBeNull();
  });

  it("discards later stages too, honouring the confirmation dialog's promise", () => {
    // Sequential navigation already nulls later stages, so force the
    // invariant: a state with a selection two pages ahead must come back
    // clean after one `back`.
    const ahead: WizardDraftState = {
      ...initialWizardState(),
      pageId: 4,
      selections: {
        ...initialWizardState().selections,
        stage3: { choice: "NAIS" },
        stage4: { choice: "Tour of Duty" },
      },
    };
    const state = walkBack(ahead);
    expect(state.pageId).toBe(3);
    expect(state.selections.stage3).toBeNull();
    expect(state.selections.stage4).toBeNull();
  });
});
