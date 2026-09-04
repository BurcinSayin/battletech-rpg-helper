/**
 * Tests for `scripts/extract-rules.ts` (build step #11).
 *
 * The count assertions read `docs/RULES.md` §8 at test time — the doc is the
 * single source for the Table M/Table G numbers, per issue #32 ("The test
 * must read those from §8 rather than hard-coding them"). The "Born
 * Mercenary Brat" expectations transcribe the worked example in §7.4.
 *
 * These tests require the read-only desktop checkout at
 * `../Battletech-Character-Creator` (override with `BTCC_SOURCE_DIR`), like
 * `npm run rules:ingest` itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildModulesFile, type ModuleEntry } from "./extract-rules";

const rulesDoc = readFileSync(fileURLToPath(new URL("../docs/RULES.md", import.meta.url)), "utf8");
const subskills = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/rules/subskills.json", import.meta.url)), "utf8"),
) as Record<string, string[]>;

/** The exact list `CreateSubSkillList(family)` produces at runtime (§7.4). */
function resolvedSubSkills(family: string): string[] {
  return subskills[family].map((sub) => `${family}/${sub}`).sort();
}

/** Per-stage Table M block counts, parsed from RULES.md §8. */
function tableMFromDoc(): Record<number, number> {
  const section = rulesDoc.split("#### Table M")[1]!.split("#### ")[0]!;
  const counts: Record<number, number> = {};
  for (const row of section.split("\n")) {
    const m = /^\| `stage(\d)_resurce\.cpp` \| `[^`]+` \| \*\*(\d+)\*\*/.exec(row.trim());
    if (m) counts[parseInt(m[1], 10)] = parseInt(m[2], 10);
  }
  expect(Object.keys(counts).sort()).toEqual(["1", "2", "3", "4"]);
  return counts;
}

/** Stage 3's distinct-name count from §8's "Occurrences are not distinct names". */
function stage3DistinctFromDoc(): number {
  const section = rulesDoc.split("#### Occurrences are not distinct names")[1]!.split("#### ")[0]!;
  const m = /\| \*\*(\d+)\*\* distinct \|/.exec(section);
  expect(m).not.toBeNull();
  return parseInt(m![1], 10);
}

const file = buildModulesFile();
const byStage = (stage: number): ModuleEntry[] => file.modules.filter((m) => m.stage === stage);
const byName = (name: string, stage?: number): ModuleEntry =>
  file.modules.find((m) => m.name === name && (stage === undefined || m.stage === stage))!;

describe("§8 Table M agreement", () => {
  it("reports the published per-stage block counts", () => {
    const doc = tableMFromDoc();
    for (const stage of [1, 2, 3, 4]) {
      expect(file.meta.tableM[`stage${stage}`].blocks).toBe(doc[stage]);
    }
  });

  it("reports the published stage-3 distinct-name count (occurrences are not names)", () => {
    expect(file.meta.tableM.stage3.distinct).toBe(stage3DistinctFromDoc());
    expect(byStage(3).length).toBe(stage3DistinctFromDoc());
  });

  it("reports the Table G counts", () => {
    expect(file.meta.tableG).toEqual({
      stage2_nameAttr: 11,
      stage2_nameClan: 2,
      stage3_school: 10,
      stage3_affVar: 4,
    });
  });
});

describe("§7.4 worked example — Born Mercenary Brat", () => {
  const brat = byName("Born Mercenary Brat");

  it("is a stage-1 module with the documented number and cost", () => {
    expect(brat.stage).toBe(1);
    expect(brat.kind).toBe("module");
    expect(brat.desktopNumber).toBe(2);
    expect(brat.xpCost).toBe(270);
  });

  it("carries the documented attribute deltas in raw XP", () => {
    expect(brat.attrDeltas).toEqual({
      STR: 75,
      BOD: 50,
      RFL: 100,
      WIL: 25,
      CHA: -25,
      EDG: 25,
    });
  });

  it("carries the documented signed trait grants", () => {
    expect(brat.traitGrants).toEqual([
      { name: "Equipped", xp: 50 },
      { name: "Illiterate", xp: -50 },
      { name: "Reputation", xp: -50 },
    ]);
  });

  it("carries the documented skill grants (deferred ones excluded)", () => {
    expect(brat.skillGrants).toEqual([
      { name: "Career/Soldier", xp: 10 },
      { name: "Interests/Military History", xp: 5 },
      { name: "Martial Arts", xp: 15 },
      { name: "Melee Weapons", xp: 10 },
      { name: "Negotiation", xp: 5 },
      { name: "Perception", xp: 5 },
    ]);
  });

  it("carries the two deferred …/Any picks with resolved candidates", () => {
    expect(brat.deferredPicks).toEqual([
      {
        slot: 1,
        label: "Language/Any",
        kind: "skill",
        candidates: resolvedSubSkills("Language"),
        candidatesSource: "CreateSubSkillList(Language)",
        xp: 10,
        repeats: null,
      },
      {
        slot: 2,
        label: "Streetwise/Any",
        kind: "skill",
        candidates: resolvedSubSkills("Streetwise"),
        candidatesSource: "CreateSubSkillList(Streetwise)",
        xp: 10,
        repeats: null,
      },
    ]);
  });

  it("carries prerequisites in ×100 form", () => {
    expect(brat.prerequisites).toEqual({
      attrs: { STR: 400, BOD: 400, WIL: 400 },
      traits: [],
      skills: [],
    });
  });

  it("is available only for Independent (affVar 12, subAffVar 4)", () => {
    expect(brat.availability).toEqual(["Independent"]);
  });
});

describe("determinism", () => {
  it("produces byte-identical output across runs", () => {
    const first = JSON.stringify(buildModulesFile(), null, 2);
    const second = JSON.stringify(buildModulesFile(), null, 2);
    expect(first).toBe(second);
  });

  it("matches the committed modules.json (regenerate with npm run rules:extract)", () => {
    const committed = readFileSync(
      fileURLToPath(new URL("../data/rules/modules.json", import.meta.url)),
      "utf8",
    );
    expect(JSON.stringify(buildModulesFile(), null, 2) + "\n").toBe(committed);
  });
});

describe("availability is resolved affiliation names", () => {
  it("never carries a bare integer in availability", () => {
    for (const m of file.modules) {
      for (const name of m.availability) {
        expect(typeof name).toBe("string");
        expect(Number.isNaN(Number(name))).toBe(true);
        expect(file.meta.affiliations).toContain(name);
      }
    }
  });

  it("resolves numeric indices via resource/affilations.dat", () => {
    expect(file.meta.affiliations[12]).toBe("Independent");
    expect(byName("Trueborn Creche").availability).toEqual(["Invading Clan", "Homeworld Clan"]);
    expect(byName("Dark Caste", 4).availability).toEqual(["Invading Clan", "Homeworld Clan"]);
    expect(byName("Ne'er-Do-Well", 4).availability).toHaveLength(13);
  });
});

describe("Table G blocks are not modules", () => {
  it("keeps sibko attribute picks out of the module inventory", () => {
    // Freeborn (5 branches) + Trueborn (6 branches) nameAttr dispatches.
    const sibkoBranchNames = [
      "Aerospace",
      "Cavalry",
      "Elemental",
      "Infantry",
      "MechWarrior",
      "Aerospace",
      "Elemental",
      "Elemental (Advanced)",
      "ProtoMech",
      "ProtoMech (Advanced)",
      "MechWarrior",
    ];
    const stage2Names = byStage(2).map((m) => m.name);
    for (const sibkoName of [...new Set(sibkoBranchNames)]) {
      expect(stage2Names).not.toContain(sibkoName);
    }
    const sibkoBranches = file.gating.filter((g) => g.kind === "sibkoBranch");
    expect(sibkoBranches.map((g) => g.name).sort()).toEqual([...sibkoBranchNames].sort());
  });

  it("emits sibko pickers with their clan branches", () => {
    const trueborn = file.gating.find((g) => g.kind === "sibkoPicker" && g.appliesTo === "Trueborn Sibko");
    expect(trueborn).toBeDefined();
    const conditions = JSON.stringify(trueborn!.branches?.map((b) => b.condition));
    expect(conditions).toContain("Ghost Bear");
    expect(conditions).toContain("Hell's Horses");
    expect(conditions).toContain("Blood Spirit");
  });

  it("emits school-list gating by name, not index", () => {
    const gates = file.gating.filter((g) => g.kind === "schoolListGate");
    expect(gates.map((g) => g.name)).toEqual(["Franklin Fiefs", "JarnFolk"]);
    expect(gates.find((g) => g.name === "JarnFolk")!.schools).toEqual(["Family Training"]);
  });
});

describe("module entry shape", () => {
  it("gives every module the §7.4 fields", () => {
    for (const m of file.modules) {
      // xpCost is null only where the desktop charges per-branch (Trueborn
      // Sibko's cost lives on its nameAttr dispatches).
      const costOrNull = m.xpCost === null || typeof m.xpCost === "number";
      expect(costOrNull).toBe(true);
      expect(m).toMatchObject({
        stage: expect.any(Number),
        kind: expect.any(String),
        name: expect.any(String),
        blockIndex: expect.any(Number),
        attrDeltas: expect.any(Object),
        traitGrants: expect.any(Array),
        skillGrants: expect.any(Array),
        deferredPicks: expect.any(Array),
        prerequisites: expect.objectContaining({ attrs: expect.any(Object) }),
        availability: expect.any(Array),
        source: expect.objectContaining({ file: expect.any(String), line: expect.any(Number) }),
      });
      expect(m.source.line).toBeGreaterThan(0);
    }
  });

  it("never duplicates a module name within a stage", () => {
    for (const stage of [1, 2, 3, 4]) {
      const names = byStage(stage).map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("counts 115 distinct selectable entries across the four stages", () => {
    expect(file.modules.length).toBe(115);
    expect(byStage(1).length).toBe(11);
    expect(byStage(2).length).toBe(13);
    expect(byStage(3).length).toBe(66);
    expect(byStage(4).length).toBe(25);
  });
});
