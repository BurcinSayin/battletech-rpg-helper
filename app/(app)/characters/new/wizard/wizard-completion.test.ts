import { describe, it, expect } from "vitest";
import { computeXp, reconcileWizardXp } from "@/lib/characters";
import { canFinish, initialWizardState, wizardReducer } from "./wizard-state";
import { fullWizardState } from "./test-fixtures";

describe("wizard completion", () => {
  it("finishes a full five-stage run with nonnegative XP matching the editor", () => {
    const state = fullWizardState();
    expect(canFinish(state)).toBe(true);
    expect(state.draft.scalars).toMatchObject({
      aff: "Major Periphery State",
      earlychild: "Street",
      latechild: "Back Woods",
      schoolname: "Technical College",
      reallife: "Travel",
    });
    const finished = reconcileWizardXp(state.draft, state.wizardXpRemaining);
    expect(computeXp(finished).remaining).toBe(state.wizardXpRemaining);
    expect(computeXp(finished).remaining).toBeGreaterThanOrEqual(0);
    expect(finished.scalars.gmxpmod).toBe(
      state.xp.budget - state.xp.spent - state.wizardXpRemaining,
    );
    expect(state.draft.scalars.gmxpmod).toBe(0);
  });

  it("allows skipped adult stages but prevents early, pending, and overspent completion", () => {
    const full = fullWizardState();
    expect(canFinish(initialWizardState())).toBe(false);
    expect(canFinish(wizardReducer(full, { type: "back" }))).toBe(false);
    const pending = wizardReducer(full, {
      type: "setRealLife",
      moduleName: "Civilian Job",
    });
    expect(canFinish(pending)).toBe(false);
    expect(canFinish({ ...full, wizardXpRemaining: -1 })).toBe(false);
    const skipped = wizardReducer(wizardReducer(full, { type: "back" }), {
      type: "skipSchool",
    });
    expect(canFinish(wizardReducer(skipped, { type: "skipRealLife" }))).toBe(
      true,
    );
  });
});
