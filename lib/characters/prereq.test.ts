import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc";
import { childhoodCatalog } from "@/lib/rules/load";
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
});

describe("CheckPrereq module waivers", () => {
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
