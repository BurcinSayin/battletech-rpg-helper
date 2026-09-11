import { describe, it, expect } from "vitest";
import {
  initialWizardState,
  wizardReducer,
  canAdvance,
  type WizardDraftState,
  type WizardAction,
} from "./wizard-state";

function drive(state: WizardDraftState, ...actions: WizardAction[]) {
  return actions.reduce(wizardReducer, state);
}
function stage3() {
  let state = drive(
    initialWizardState(),
    { type: "next" },
    { type: "setStage0Affiliation", affiliationId: 7 },
    { type: "setStage0SubAffiliation", subAffiliationId: 0 },
    { type: "setStage0StartingLanguage", startingLanguage: "Language/English" },
    { type: "next" },
    { type: "setStageModule", stage: "stage1", moduleName: "Street" },
  );
  const resolution = state.childhood.stage1.resolution;
  if (resolution?.status === "invalid" || !resolution?.module)
    throw new Error("Invalid fixture");
  for (const choice of resolution.module.layer.choices)
    state = wizardReducer(state, {
      type: "setStageChoice",
      stage: "stage1",
      choiceId: choice.id,
      candidates: Array.from(
        { length: choice.selectionCount },
        () => choice.candidates[0],
      ),
    });
  return drive(
    state,
    { type: "next" },
    { type: "setStageModule", stage: "stage2", moduleName: "Back Woods" },
    { type: "next" },
  );
}
function technicalCollege(state = stage3()) {
  return drive(
    state,
    { type: "setSchool", moduleName: "Technical College" },
    {
      type: "setSchoolChoice",
      choiceId: "school-1-0",
      candidate: { kind: "skill", value: "Interests/Aerospace" },
    },
    {
      type: "setSchoolField",
      index: 0,
      tier: "basic",
      name: "Pilot - Aerospace (Civilian)",
    },
  );
}

describe("wizard Stages 3–4 replay", () => {
  it("charges school and field skills, applies the rebate once on entry, and reverses it on Back", () => {
    const prefix = stage3();
    const school = technicalCollege(prefix);
    expect(canAdvance(school)).toBe(true);
    expect(school.wizardXpRemaining).toBe(prefix.wizardXpRemaining - 600 - 180);
    expect(school.adult?.school.rebate).toBe(36);
    expect(school.draft.scalars.age).toBe(prefix.draft.scalars.age + 1);
    const stage4 = wizardReducer(school, { type: "next" });
    expect(stage4.wizardXpRemaining).toBe(school.wizardXpRemaining + 36);
    const back = wizardReducer(stage4, { type: "back" });
    expect(back.draft).toEqual(school.draft);
    expect(back.wizardXpRemaining).toBe(school.wizardXpRemaining);
    expect(wizardReducer(back, { type: "next" }).wizardXpRemaining).toBe(
      stage4.wizardXpRemaining,
    );
    const childhood = wizardReducer(back, { type: "back" });
    expect(childhood.draft).toEqual(prefix.draft);
    expect(childhood.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
  });

  it("requires a complete basic field and rejects forged schools, fields, and choices atomically", () => {
    const prefix = stage3();
    expect(
      wizardReducer(prefix, {
        type: "setSchool",
        moduleName: "Invented school",
      }),
    ).toBe(prefix);
    const pending = wizardReducer(prefix, {
      type: "setSchool",
      moduleName: "Technical College",
    });
    expect(canAdvance(pending)).toBe(false);
    expect(wizardReducer(pending, { type: "next" })).toBe(pending);
    expect(
      wizardReducer(pending, {
        type: "setSchoolChoice",
        choiceId: "school-1-0",
        candidate: { kind: "trait", value: "Wealth" },
      }),
    ).toBe(pending);
    expect(
      wizardReducer(pending, {
        type: "setSchoolField",
        index: 0,
        tier: "basic",
        name: "Doctor",
      }),
    ).toBe(pending);
    expect(
      wizardReducer(pending, {
        type: "setSchoolField",
        index: 0,
        tier: "specialist",
        name: "Doctor",
      }),
    ).toBe(pending);
  });

  it("skips selected School without retaining grants, age, prerequisites, or rebates", () => {
    const prefix = stage3();
    const result = wizardReducer(technicalCollege(prefix), {
      type: "skipSchool",
    });
    expect(result.pageId).toBe(5);
    expect(result.draft).toEqual(prefix.draft);
    expect(result.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
    expect(result.selections.stage3).toBeNull();
  });

  it("keeps previews uncharged and commits multiple distinct Real Life modules", () => {
    const prefix = wizardReducer(technicalCollege(), { type: "next" });
    const preview = wizardReducer(prefix, {
      type: "setRealLife",
      moduleName: "Travel",
    });
    expect(preview.draft).toEqual(prefix.draft);
    expect(preview.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
    const first = wizardReducer(preview, { type: "addRealLife" });
    expect(first.wizardXpRemaining).toBe(prefix.wizardXpRemaining - 900);
    expect(first.draft.scalars.age).toBe(prefix.draft.scalars.age + 6);
    expect(wizardReducer(first, { type: "addRealLife" })).toBe(first);
    expect(
      wizardReducer(first, { type: "setRealLife", moduleName: "Travel" }),
    ).toBe(first);
    const second = drive(
      first,
      { type: "setRealLife", moduleName: "Civilian Job" },
      { type: "addRealLife" },
    );
    expect(second.draft.scalars.reallife).toBe("Travel; Civilian Job");
    expect(second.draft.scalars.age).toBe(prefix.draft.scalars.age + 12);
    expect(second.wizardXpRemaining).toBe(prefix.wizardXpRemaining - 1500);
    expect(
      wizardReducer(second, { type: "removeRealLife", index: 1 }).draft,
    ).toEqual(first.draft);
    const removed = wizardReducer(second, { type: "removeRealLife", index: 0 });
    expect(removed.draft).toEqual(prefix.draft);
    expect(removed.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
    const renamed = wizardReducer(second, { type: "setName", name: "Pilot" });
    expect(renamed.wizardXpRemaining).toBe(second.wizardXpRemaining);
    expect(renamed.draft.attrs).toEqual(second.draft.attrs);
  });

  it("skips Real Life and removes all its effects on Back", () => {
    const school = technicalCollege();
    const prefix = wizardReducer(school, { type: "next" });
    const life = drive(
      prefix,
      { type: "setRealLife", moduleName: "Travel" },
      { type: "addRealLife" },
    );
    const skipped = wizardReducer(life, { type: "skipRealLife" });
    expect(skipped.draft).toEqual(prefix.draft);
    expect(skipped.wizardXpRemaining).toBe(prefix.wizardXpRemaining);
    expect(skipped.selections.stage4?.skipped).toBe(true);
    const back = wizardReducer(life, { type: "back" });
    expect(back.draft).toEqual(school.draft);
    expect(back.wizardXpRemaining).toBe(school.wizardXpRemaining);
    expect(back.selections.stage4).toBeNull();
  });

  it("clears later fields and all their costs when an earlier field changes", () => {
    const first = technicalCollege();
    const advanced = wizardReducer(first, {
      type: "setSchoolField",
      index: 1,
      tier: "advanced",
      name: "Cartographer",
    });
    expect(advanced.wizardXpRemaining).toBe(first.wizardXpRemaining - 180);
    const replaced = wizardReducer(advanced, {
      type: "setSchoolField",
      index: 0,
      tier: "basic",
      name: "Pilot - DropShip (Civilian)",
    });
    expect(replaced.selections.stage3?.fields).toHaveLength(1);
    expect(replaced.wizardXpRemaining).toBe(first.wizardXpRemaining);
    expect(replaced.adult?.school.rebate).toBe(36);
  });

  it("ignores adult-stage actions on earlier pages", () => {
    const initial = initialWizardState();
    expect(
      wizardReducer(initial, {
        type: "setSchool",
        moduleName: "Technical College",
      }),
    ).toBe(initial);
    expect(wizardReducer(initial, { type: "skipSchool" })).toBe(initial);
    expect(wizardReducer(initial, { type: "skipRealLife" })).toBe(initial);
    expect(
      wizardReducer(initial, { type: "setRealLife", moduleName: "Travel" }),
    ).toBe(initial);
  });

  it("retains two advanced field charges while handing off the final field name", () => {
    const first = technicalCollege();
    const result = drive(
      first,
      {
        type: "setSchoolField",
        index: 1,
        tier: "advanced",
        name: "Cartographer",
      },
      {
        type: "setSchoolField",
        index: 2,
        tier: "advanced",
        name: "Cartographer",
      },
    );
    expect(result.selections.stage3?.fields).toHaveLength(3);
    expect(result.draft.scalars.advschool).toBe("Cartographer");
    expect(result.wizardXpRemaining).toBe(first.wizardXpRemaining - 360);
    expect(result.adult?.school.rebate).toBe(108);
    expect(
      wizardReducer(result, {
        type: "setSchoolField",
        index: 3,
        tier: "advanced",
        name: "Cartographer",
      }),
    ).toBe(result);
  });
});
