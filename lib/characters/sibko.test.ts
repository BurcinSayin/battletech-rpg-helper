import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc/types";
import type { SibkoPool } from "../rules/childhood-contract";
import { childhoodCatalog, stage0Catalog } from "../rules/load";
import {
  applyChildhoodModule,
  resolveChildhoodModule,
  type ChildhoodContext,
  type ChildhoodSelection,
} from "./childhood";
import {
  resolveSibkoFields,
  type SibkoFieldSelection,
  type SibkoSelection,
} from "./sibko";

function clanContext(clan: string): ChildhoodContext {
  for (const affiliation of stage0Catalog.affiliations) {
    if (
      affiliation.name !== "Invading Clan" &&
      affiliation.name !== "Homeworld Clan"
    )
      continue;
    const subAffiliation = affiliation.subAffiliations.find(
      (entry) => entry.name === clan,
    );
    if (subAffiliation)
      return {
        affiliation: affiliation.name,
        subAffiliationId: subAffiliation.id,
        subAffiliation: clan,
        caste: "Warrior Caste(Other)",
        startingLanguage: "Language/English",
        stage1Module: "Trueborn Creche",
        traits: [],
      };
  }
  throw new Error(`Missing Clan context: ${clan}`);
}

function branchPackage(
  moduleName: string,
  branch: string,
  clan = "Ghost Bear",
) {
  const selection: ChildhoodSelection = {
    moduleName,
    choices: [],
    phenotype: null,
    sibko: { branch, basic: [], advanced: [] },
  };
  const resolution = resolveChildhoodModule(
    childhoodCatalog,
    2,
    selection,
    clanContext(clan),
  );
  if (resolution.status !== "complete" || !resolution.module.sibkoPools) {
    throw new Error(
      `Incomplete Sibko package ${moduleName}/${branch}: ${resolution.status}`,
    );
  }
  return {
    selection,
    module: resolution.module,
    pools: resolution.module.sibkoPools,
  };
}

function allFields(pool: SibkoPool): readonly SibkoFieldSelection[] {
  return pool.groups.map((group) => {
    const skill = group.skills[0];
    if (!skill) throw new Error(`Empty Sibko group: ${group.id}`);
    return { groupId: group.id, skill };
  });
}

const twoFields: SibkoPool = {
  budgetXp: 60,
  stepXp: 30,
  rebateXp: 6,
  groups: [
    { id: "Small Arms", skills: ["Small Arms"] },
    { id: "MedTech", skills: ["MedTech"] },
  ],
};
const noFields: SibkoSelection = {
  branch: "Aerospace",
  basic: [],
  advanced: [],
};

describe("resolveSibkoFields", () => {
  it("accepts empty and partial pools without transferring unused XP", () => {
    expect(resolveSibkoFields(twoFields, twoFields, noFields)).toEqual({
      status: "complete",
      basicSkills: [],
      advancedSkills: [],
      basicRemaining: 60,
      advancedRemaining: 60,
      rebateXp: 0,
    });
    expect(
      resolveSibkoFields(twoFields, twoFields, {
        ...noFields,
        basic: [{ groupId: "MedTech", skill: "MedTech" }],
      }),
    ).toEqual({
      status: "complete",
      basicSkills: [{ name: "MedTech", xp: 30 }],
      advancedSkills: [],
      basicRemaining: 30,
      advancedRemaining: 60,
      rebateXp: 6,
    });
  });

  it("rejects unknown groups, foreign skills and repeated selections", () => {
    expect(
      resolveSibkoFields(twoFields, twoFields, {
        ...noFields,
        basic: [{ groupId: "Forged", skill: "Small Arms" }],
      }),
    ).toEqual({ status: "invalid", reason: "group" });
    expect(
      resolveSibkoFields(twoFields, twoFields, {
        ...noFields,
        advanced: [{ groupId: "Small Arms", skill: "MedTech" }],
      }),
    ).toEqual({ status: "invalid", reason: "skill" });
    expect(
      resolveSibkoFields(twoFields, twoFields, {
        ...noFields,
        basic: [
          { groupId: "Small Arms", skill: "Small Arms" },
          { groupId: "Small Arms", skill: "Small Arms" },
        ],
      }),
    ).toEqual({ status: "invalid", reason: "duplicate" });
    const overlapping: SibkoPool = {
      ...twoFields,
      groups: [
        { id: "first", skills: ["Small Arms"] },
        { id: "second", skills: ["Small Arms", "MedTech"] },
      ],
    };
    expect(
      resolveSibkoFields(overlapping, twoFields, {
        ...noFields,
        basic: [
          { groupId: "first", skill: "Small Arms" },
          { groupId: "second", skill: "Small Arms" },
        ],
      }),
    ).toEqual({ status: "invalid", reason: "duplicate" });
    expect(
      resolveSibkoFields(overlapping, twoFields, {
        ...noFields,
        basic: [
          { groupId: "first", skill: "Small Arms" },
          { groupId: "second", skill: "MedTech" },
        ],
      }),
    ).toMatchObject({
      status: "complete",
      basicSkills: [
        { name: "Small Arms", xp: 30 },
        { name: "MedTech", xp: 30 },
      ],
    });
  });

  it("enforces each pool's budget independently", () => {
    expect(
      resolveSibkoFields({ ...twoFields, budgetXp: 59 }, twoFields, {
        ...noFields,
        basic: allFields(twoFields),
      }),
    ).toEqual({ status: "invalid", reason: "budget" });
    expect(
      resolveSibkoFields(
        twoFields,
        { ...twoFields, budgetXp: 59 },
        {
          ...noFields,
          advanced: allFields(twoFields),
        },
      ),
    ).toEqual({ status: "invalid", reason: "budget" });
  });

  it("permits Small Arms once in each pool with distinct step XP and rebates", () => {
    const pick = [{ groupId: "Small Arms", skill: "Small Arms" }];
    expect(
      resolveSibkoFields(
        twoFields,
        { ...twoFields, budgetXp: 80, stepXp: 80, rebateXp: 16 },
        {
          ...noFields,
          basic: pick,
          advanced: pick,
        },
      ),
    ).toEqual({
      status: "complete",
      basicSkills: [{ name: "Small Arms", xp: 30 }],
      advancedSkills: [{ name: "Small Arms", xp: 80 }],
      basicRemaining: 30,
      advancedRemaining: 0,
      rebateXp: 22,
    });
  });

  it("requires one Cavalry alternative per group and recovers when cleared", () => {
    const { pools } = branchPackage("Freeborn Sibko", "Cavalry");
    const group = pools.advanced.groups.find(
      (entry) => entry.id === "cavalry-2",
    );
    expect(group?.skills).toEqual([
      "Driving/Ground Vehicles",
      "Driving/Rail Vehicles",
      "Driving/Sea Vehicles",
      "Piloting/Air Vehicle",
    ]);
    const sea = { groupId: "cavalry-2", skill: "Driving/Sea Vehicles" };
    const ground = { groupId: "cavalry-2", skill: "Driving/Ground Vehicles" };
    expect(
      resolveSibkoFields(pools.basic, pools.advanced, {
        ...noFields,
        branch: "Cavalry",
        advanced: [sea, ground],
      }),
    ).toEqual({ status: "invalid", reason: "duplicate" });
    for (const advanced of [[sea], [], [ground]]) {
      const result = resolveSibkoFields(pools.basic, pools.advanced, {
        ...noFields,
        branch: "Cavalry",
        advanced,
      });
      expect(result).toMatchObject({
        status: "complete",
        advancedRemaining: 250 - advanced.length * 50,
        advancedSkills: advanced.map((field) => ({
          name: field.skill,
          xp: 50,
        })),
        rebateXp: advanced.length * 10,
      });
    }
  });
});

describe("catalog-backed Sibko packages", () => {
  it.each([
    {
      moduleName: "Freeborn Sibko",
      branch: "Aerospace",
      cost: 950,
      flex: 200,
      fieldsXp: 430,
      rebate: 86,
    },
    {
      moduleName: "Trueborn Sibko",
      branch: "Elemental (Advanced)",
      cost: 1600,
      flex: 50,
      fieldsXp: 860,
      rebate: 172,
    },
  ])(
    "matches the $moduleName/$branch full-field oracle",
    ({ moduleName, branch, cost, flex, fieldsXp, rebate }) => {
      const { module, pools } = branchPackage(moduleName, branch);
      expect(module.xpCost).toBe(cost);
      expect(module.flexPolicy?.allowance).toBe(flex);
      expect(pools.basic.groups.map((group) => group.id)).toEqual([
        "Martial Arts",
        "MedTech",
        "Melee Weapons",
        "Navigation/Ground",
        "Protocol/Ghost Bear",
        "Small Arms",
      ]);
      const result = resolveSibkoFields(pools.basic, pools.advanced, {
        branch,
        basic: allFields(pools.basic),
        advanced: allFields(pools.advanced),
      });
      if (result.status !== "complete")
        throw new Error(`Invalid full pool: ${result.reason}`);
      expect(
        [...result.basicSkills, ...result.advancedSkills].reduce(
          (sum, row) => sum + row.xp,
          0,
        ),
      ).toBe(fieldsXp);
      expect(result.basicRemaining).toBe(0);
      expect(result.advancedRemaining).toBe(0);
      expect(result.rebateXp).toBe(rebate);
      if (branch === "Elemental (Advanced)") {
        expect(
          [...result.basicSkills, ...result.advancedSkills]
            .filter((row) => row.name === "Small Arms")
            .reduce((sum, row) => sum + row.xp, 0),
        ).toBe(130);
      }
    },
  );

  it("gives ProtoMech Advanced Navigation/Ground 155 across fixed and both pools", () => {
    const { module, pools, selection } = branchPackage(
      "Trueborn Sibko",
      "ProtoMech (Advanced)",
      "Blood Spirit",
    );
    const result = resolveSibkoFields(pools.basic, pools.advanced, {
      branch: "ProtoMech (Advanced)",
      basic: allFields(pools.basic),
      advanced: allFields(pools.advanced),
    });
    if (result.status !== "complete")
      throw new Error(`Invalid full pool: ${result.reason}`);
    const fixed = applyChildhoodModule(emptyDraft(), module, selection);
    expect(
      [...fixed.skills, ...result.basicSkills, ...result.advancedSkills]
        .filter((row) => row.name === "Navigation/Ground")
        .reduce((sum, row) => sum + row.xp, 0),
    ).toBe(155);
    expect(module.xpCost).toBe(1500);
    expect(module.flexPolicy?.allowance).toBe(15);
  });

  it("requires a branch and restricts advanced branches by exact Clan name, not caste", () => {
    const selection: ChildhoodSelection = {
      moduleName: "Trueborn Sibko",
      choices: [],
      phenotype: null,
      sibko: noFields,
    };
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        {
          ...selection,
          sibko: { ...noFields, branch: null },
        },
        clanContext("Ghost Bear"),
      ),
    ).toEqual({ status: "incomplete", reason: "branch", module: null });
    for (const clan of ["Ghost Bear", "Hell's Horses"]) {
      for (const caste of ["Warrior Caste(Other)", "Scientist Caste", null]) {
        expect(
          resolveChildhoodModule(
            childhoodCatalog,
            2,
            {
              ...selection,
              sibko: { ...noFields, branch: "Elemental (Advanced)" },
            },
            { ...clanContext(clan), caste },
          ).status,
        ).toBe("complete");
      }
      expect(
        resolveChildhoodModule(
          childhoodCatalog,
          2,
          {
            ...selection,
            sibko: { ...noFields, branch: "ProtoMech (Advanced)" },
          },
          clanContext(clan),
        ),
      ).toEqual({ status: "invalid", reason: "branch" });
    }
    expect(
      resolveChildhoodModule(
        childhoodCatalog,
        2,
        {
          ...selection,
          sibko: { ...noFields, branch: "Elemental (Advanced)" },
        },
        clanContext("Blood Spirit"),
      ),
    ).toEqual({ status: "invalid", reason: "branch" });
  });

  it("projects a replacement branch from the retained prefix without changing phenotype", () => {
    const prefix = emptyDraft();
    prefix.attrs = { CHA: 100, EDG: 100 };
    prefix.scalars.phenotype = "Phenotype/Elemental";
    prefix.preAttrs = { INT: 100 };
    const elemental = branchPackage("Trueborn Sibko", "Elemental (Advanced)");
    const aerospace = branchPackage("Trueborn Sibko", "Aerospace");
    const first = applyChildhoodModule(
      prefix,
      elemental.module,
      elemental.selection,
    );
    const replacement = applyChildhoodModule(
      prefix,
      aerospace.module,
      aerospace.selection,
    );
    expect(first.scalars.phenotype).toBe("Phenotype/Elemental");
    expect(replacement.scalars.phenotype).toBe("Phenotype/Elemental");
    expect(first.attrs).toEqual({ CHA: 70, EDG: 70 });
    expect(first.preAttrs.BOD).toBe(600);
    expect(first.traits).toContainEqual({ name: "Equipped", xp: 50 });
    expect(replacement.attrs).toEqual({ CHA: 100, EDG: 100 });
    expect(replacement.preAttrs).toEqual({
      INT: 100,
      BOD: 300,
      DEX: 400,
      RFL: 300,
      WIL: 300,
    });
    expect(replacement.traits).toEqual([{ name: "Custom Vehicle", xp: 200 }]);
    expect(replacement.skills).toEqual([
      { name: "Gunnery/Spacecraft", xp: 20 },
      { name: "Piloting/Spacecraft", xp: 20 },
      { name: "Navigation/Air", xp: 40 },
    ]);
    expect(prefix.preAttrs).toEqual({ INT: 100 });
    expect(prefix.skills).toEqual([]);
    expect(prefix.traits).toEqual([]);
  });
});
