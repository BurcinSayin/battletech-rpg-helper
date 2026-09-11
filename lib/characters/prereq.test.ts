import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc";
import { childhoodCatalog } from "@/lib/rules/load";
import {
  initialWizardState,
  wizardReducer,
  type WizardAction,
} from "@/app/(app)/characters/new/wizard/wizard-state";
import { validateFlexAllocations } from "./flex-xp";
import {
  checkPrerequisites,
  mergePrerequisites,
  type PrerequisiteSet,
} from "./prereq";

const requirements = (
  attrs: Record<string, number> = {},
  skills: PrerequisiteSet["skills"] = [],
  traits: PrerequisiteSet["traits"] = [],
): PrerequisiteSet => ({ attrs, skills, traits });

describe("prerequisite collection", () => {
  it("max-merges attributes, skills, and traits in first-seen order", () => {
    expect(
      mergePrerequisites([
        requirements(
          { WIL: 300, STR: 200 },
          [
            { name: "Leadership", xp: 20 },
            { name: "Computers", xp: 35 },
          ],
          [
            { name: "Rank", xp: 20 },
            { name: "Fit", xp: 15 },
          ],
        ),
        requirements(
          { WIL: 400, DEX: 300 },
          [
            { name: "Computers", xp: 50 },
            { name: "Leadership", xp: 10 },
            { name: "Running", xp: 30 },
          ],
          [
            { name: "Fit", xp: 40 },
            { name: "Connections", xp: 15 },
          ],
        ),
        requirements(
          { STR: 100, INT: 500 },
          [{ name: "Leadership", xp: 60 }],
          [{ name: "Rank", xp: 5 }],
        ),
      ]),
    ).toEqual({
      attrs: { WIL: 400, STR: 200, DEX: 300, INT: 500 },
      skills: [
        { name: "Leadership", xp: 60 },
        { name: "Computers", xp: 50 },
        { name: "Running", xp: 30 },
      ],
      traits: [
        { name: "Rank", xp: 20 },
        { name: "Fit", xp: 40 },
        { name: "Connections", xp: 15 },
      ],
    });
  });

  it("uses the Stage 2 Military School fixture's ×100 WIL prerequisite", () => {
    const militarySchool = childhoodCatalog.modules.find(
      (module) => module.stage === 2 && module.name === "Military School",
    );
    expect(militarySchool).toBeDefined();
    if (!militarySchool) return;

    const draft = emptyDraft();
    draft.attrs.WIL = 299;
    const below = checkPrerequisites(draft, [
      militarySchool.layer.prerequisites,
    ]);
    expect(militarySchool.layer.prerequisites.attrs.WIL).toBe(300);
    expect(below.unmet).toEqual([
      { kind: "attribute", name: "WIL", required: 300, actual: 299 },
    ]);
    expect(below.satisfied).toBe(false);

    draft.attrs.WIL = 300;
    const met = checkPrerequisites(draft, [militarySchool.layer.prerequisites]);
    expect(met.satisfied).toBe(true);
    expect(met.unmet).toEqual([]);
  });

  it.each([-50, 0, 20])(
    "requires skill and trait rows to exist even when the minimum is %i XP",
    (minimum) => {
      const draft = emptyDraft();
      const stages = [
        requirements(
          {},
          [{ name: "Leadership", xp: minimum }],
          [{ name: "Reputation", xp: minimum }],
        ),
      ];
      const missing = checkPrerequisites(draft, stages);
      expect(missing.satisfied).toBe(false);
      expect(missing.unmet).toEqual([
        { kind: "skill", name: "Leadership", required: minimum, actual: 0 },
        { kind: "trait", name: "Reputation", required: minimum, actual: 0 },
      ]);

      draft.skills = [{ name: "Leadership", xp: minimum }];
      draft.traits = [{ name: "Reputation", xp: minimum }];
      expect(checkPrerequisites(draft, stages).satisfied).toBe(true);

      draft.skills[0].xp--;
      draft.traits[0].xp--;
      expect(checkPrerequisites(draft, stages).unmet).toEqual([
        {
          kind: "skill",
          name: "Leadership",
          required: minimum,
          actual: minimum - 1,
        },
        {
          kind: "trait",
          name: "Reputation",
          required: minimum,
          actual: minimum - 1,
        },
      ]);
    },
  );

  it("spends and refunds Stage 2 flex without changing the main wizard XP pool", () => {
    // Major Periphery (75), Street (250), Back Woods (500): 5000 - 825 = 4175.
    // RULES.md §4: grants change the draft's stats; only module costs debit
    // Wizard::changeXP. Final gmxpmod reconciliation belongs to step 14.
    const actions: WizardAction[] = [
      { type: "next" },
      { type: "setStage0Affiliation", affiliationId: 7 },
      { type: "setStage0SubAffiliation", subAffiliationId: 0 },
      {
        type: "setStage0StartingLanguage",
        startingLanguage: "Language/English",
      },
      { type: "next" },
      { type: "setStageModule", stage: "stage1", moduleName: "Street" },
      ...[1, 2, 3, 4].map((position): WizardAction => ({
        type: "setStageChoice",
        stage: "stage1",
        choiceId: `more:${position}`,
        candidates: [{ kind: "attribute", value: "STR" }],
      })),
      { type: "next" },
      { type: "setStageModule", stage: "stage2", moduleName: "Back Woods" },
    ];
    const fixed = actions.reduce(wizardReducer, initialWizardState());
    expect(fixed.stage2Complete).toBe(true);
    expect(fixed.wizardXpRemaining).toBe(4175);
    const view = fixed.childhood.stage2;
    if (
      view.resolution?.status !== "complete" ||
      !view.resolution.module.flexPolicy
    )
      throw new Error("Expected the Back Woods flex allowance");
    const policy = view.resolution.module.flexPolicy;
    expect(policy.allowance).toBe(125);

    const allocated = wizardReducer(fixed, {
      type: "setStage2FlexGrant",
      candidate: { kind: "attribute", value: "WIL" },
      xp: 125,
    });
    expect(allocated.draft.attrs.WIL).toBe(fixed.draft.attrs.WIL + 125);
    expect(
      validateFlexAllocations(
        policy,
        allocated.selections.stage2!.flexGrants,
        view.flexTargets,
      ),
    ).toEqual({ valid: true, spent: 125, remaining: 0 });
    expect(allocated.wizardXpRemaining).toBe(4175);
    expect(allocated.moduleXpSpent).toBe(fixed.moduleXpSpent);
    expect(allocated.xp.remaining).toBe(fixed.xp.remaining - 125);

    const refunded = wizardReducer(allocated, { type: "resetStage2Flex" });
    expect(refunded.wizardXpRemaining).toBe(4175);
    expect(refunded.draft).toEqual(fixed.draft);
    expect(refunded.xp).toEqual(fixed.xp);
  });
});

describe("CheckPrereq module waivers", () => {
  it.each([
    ["Nobility", "Wealth", 500],
    ["Nobility", "Title", 500],
    ["Nobility", "Property", 500],
    ["White Collar", "Wealth", 300],
    ["White Collar", "Property", 300],
  ] as const)(
    "waives %s traits through %s at %i XP",
    (moduleName, trait, threshold) => {
      const draft = emptyDraft();
      draft.scalars.earlychild = moduleName;
      draft.traits = [{ name: trait, xp: threshold - 1 }];
      const stages = [
        requirements(
          { WIL: 300 },
          [{ name: "Leadership", xp: 30 }],
          [{ name: "Connections", xp: 100 }],
        ),
      ];
      expect(
        checkPrerequisites(draft, stages).unmet.map((entry) => entry.kind),
      ).toEqual(["attribute", "skill", "trait"]);

      draft.traits[0].xp = threshold;
      const report = checkPrerequisites(draft, stages);
      expect(report.satisfied).toBe(false);
      expect(report.unmet.map((entry) => entry.kind)).toEqual([
        "attribute",
        "skill",
      ]);
      expect(report.requirements).toEqual(stages[0]);

      draft.scalars.earlychild = "Street";
      expect(
        checkPrerequisites(draft, stages).unmet.map((entry) => entry.kind),
      ).toEqual(["attribute", "skill", "trait"]);
    },
  );

  it("waives Covert Operations skill and trait requirements through Connections", () => {
    const draft = emptyDraft();
    draft.scalars.reallife = "Covert Operations";
    draft.skills = [{ name: "Leadership", xp: 149 }];
    draft.traits = [{ name: "Connections", xp: 150 }];

    const report = checkPrerequisites(draft, [
      requirements(
        {},
        [{ name: "Leadership", xp: 150 }],
        [{ name: "Security", xp: 100 }],
      ),
    ]);

    expect(report.satisfied).toBe(true);
    expect(report.unmet).toEqual([]);
  });
});
