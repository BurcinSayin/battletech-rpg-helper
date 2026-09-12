import {
  initialWizardState,
  wizardReducer,
  type WizardAction,
} from "./wizard-state";

/** A real catalog path through all five stages, including a field rebate. */
export function fullWizardState() {
  const actions: WizardAction[] = [
    { type: "setName", name: "Wizard Pilot" },
    { type: "next" },
    { type: "setStage0Affiliation", affiliationId: 7 },
    { type: "setStage0SubAffiliation", subAffiliationId: 0 },
    { type: "setStage0StartingLanguage", startingLanguage: "Language/English" },
    { type: "next" },
    { type: "setStageModule", stage: "stage1", moduleName: "Street" },
  ];
  let state = actions.reduce(wizardReducer, initialWizardState());
  const resolution = state.childhood.stage1.resolution;
  if (!resolution || resolution.status === "invalid" || !resolution.module)
    throw new Error("Invalid wizard fixture");
  for (const choice of resolution.module.layer.choices) {
    state = wizardReducer(state, {
      type: "setStageChoice",
      stage: "stage1",
      choiceId: choice.id,
      candidates: Array.from(
        { length: choice.selectionCount },
        () => choice.candidates[0],
      ),
    });
  }
  const remaining: WizardAction[] = [
    { type: "next" },
    { type: "setStageModule", stage: "stage2", moduleName: "Back Woods" },
    { type: "next" },
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
    { type: "next" },
    { type: "setRealLife", moduleName: "Travel" },
    {
      type: "setRealLifeChoices",
      index: null,
      choices: { "life-1-0": { kind: "skill", value: "Art/Dance" } },
    },
    { type: "addRealLife" },
  ];
  return remaining.reduce(wizardReducer, state);
}
