// allow: SIZE_OK — Pre-existing generator regression core predating this work; new Stage 0 extraction is deliberately split into sub-250 modules (extract-stage0.ts, stage0-*.ts); splitting legacy cores is out of scope for this plan.
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
import { resolve } from "node:path";

import { buildModulesFile, type ModuleEntry } from "./extract-rules";
import { stage0Cases } from "./stage0-extraction.cases";
import modulesJson from "../data/rules/modules.json";

stage0Cases(() => buildModulesFile().stage0);
import "./stage0-source.cases";

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

function tableGFromDoc(): Record<string, number> {
  const section = rulesDoc.split("#### Table G")[1]?.split("#### ")[0] ?? "";
  const rows = [
    ...section.matchAll(
      /^\| `stage([23])_resurce\.cpp` \| `grep -c '(nameAttr|nameClan|school|affVar) ==[^`]*` \| \*\*(\d+)\*\*/gm,
    ),
  ];
  const counts = Object.fromEntries(
    rows.map((row) => ["stage" + row[1] + "_" + row[2], Number(row[3])]),
  );
  expect(Object.keys(counts).sort()).toEqual([
    "stage2_nameAttr",
    "stage2_nameClan",
    "stage3_affVar",
    "stage3_school",
  ]);
  return counts;
}

const resourceDir =
  process.env.BTCC_SOURCE_DIR ??
  fileURLToPath(
    new URL("../../Battletech-Character-Creator/resource/", import.meta.url),
  );
const sourceAffiliations = readFileSync(
  resolve(resourceDir, "affilations.dat"),
  "latin1",
)
  .split(/\r?\n/)
  .map((name) => name.trim())
  .filter(Boolean);

const file = buildModulesFile();
const byStage = (stage: number): ModuleEntry[] => file.modules.filter((m) => m.stage === stage);
const byName = (name: string, stage?: number): ModuleEntry =>
  file.modules.find((m) => m.name === name && (stage === undefined || m.stage === stage))!;

function inventoryFromDoc() {
  const section =
    rulesDoc.split("#### Selectable module inventory")[1]?.split("#### ")[0] ??
    "";
  const rows = [
    ...section.matchAll(
      /^\| ([1-4]) \| `(module|field|school)` \| \*\*(\d+)\*\* \|/gm,
    ),
  ];
  expect(rows.map((row) => row[1] + ":" + row[2])).toEqual([
    "1:module",
    "2:module",
    "3:field",
    "3:school",
    "4:module",
  ]);
  return rows.map((row) => ({
    stage: Number(row[1]),
    kind: row[2],
    count: Number(row[3]),
  }));
}

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
    expect(file.meta.tableG).toEqual(tableGFromDoc());
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

  it("matches the full published artifact including Stage 0", () => {
    // Given: the published catalog; When: rebuild from the pinned desktop source.
    const generated = buildModulesFile();
    // Then: no section may drift from the published artifact.
    expect(generated).toEqual(modulesJson);
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

  it("matches the documented inventory by stage and in total", () => {
    const inventory = inventoryFromDoc();
    for (const stage of [1, 2, 3, 4]) {
      const count = inventory
        .filter((row) => row.stage === stage)
        .reduce((sum, row) => sum + row.count, 0);
      expect(byStage(stage)).toHaveLength(count);
      expect(file.meta.tableM["stage" + stage].distinct).toBe(count);
    }
    expect(file.modules).toHaveLength(
      inventory.reduce((sum, row) => sum + row.count, 0),
    );
  });

  it("matches the documented stage-3 field and school breakdown", () => {
    for (const row of inventoryFromDoc().filter((row) => row.stage === 3)) {
      expect(
        byStage(3).filter((module) => module.kind === row.kind),
      ).toHaveLength(row.count);
    }
    expect(byName("Officer Candidate School", 3).kind).toBe("school");
  });
});

describe("Table G output coverage", () => {
  it("covers documented handlers without adding branch modules", () => {
    const counts = tableGFromDoc();
    expect(file.gating.filter((g) => g.kind === "sibkoBranch")).toHaveLength(
      counts.stage2_nameAttr,
    );
    expect(byStage(3).filter((m) => m.kind === "school")).toHaveLength(
      counts.stage3_school,
    );
    expect(
      file.gating.filter(
        (g) => g.kind === "schoolListGate" || g.kind === "schoolFieldBranch",
      ),
    ).toHaveLength(counts.stage3_affVar);
  });

  it("preserves all three outcomes of the two Trueborn clan predicates", () => {
    const picker = file.gating.find(
      (g) => g.kind === "sibkoPicker" && g.appliesTo === "Trueborn Sibko",
    );
    expect(picker?.branches).toEqual([
      {
        condition: '(nameClan == "Ghost Bear" || nameClan == "Hell\'s Horses")',
        offered: [
          "Aerospace",
          "Elemental",
          "Elemental (Advanced)",
          "ProtoMech",
          "MechWarrior",
        ],
      },
      {
        condition:
          '!(nameClan == "Ghost Bear" || nameClan == "Hell\'s Horses") && nameClan == "Blood Spirit"',
        offered: [
          "Aerospace",
          "Elemental",
          "ProtoMech",
          "ProtoMech (Advanced)",
          "MechWarrior",
        ],
      },
      {
        condition:
          '!(nameClan == "Ghost Bear" || nameClan == "Hell\'s Horses") && !(nameClan == "Blood Spirit")',
        offered: ["Aerospace", "Elemental", "ProtoMech", "MechWarrior"],
      },
    ]);
  });

  it("preserves the Franklin Fiefs school override", () => {
    expect(
      file.gating.find(
        (g) => g.kind === "schoolListGate" && g.name === "Franklin Fiefs",
      )?.schools,
    ).toEqual([
      "Technical College",
      "Trade School",
      "Solaris Internship",
      "Police Academy",
      "Intelligence Operative Training",
      "Military Enlistment",
      "Family Training",
    ]);
  });

  it.each([
    [
      "Trade School",
      [
        "Analysis",
        "Anthropologist",
        "Archaeologist",
        "Cartographer",
        "Communications",
        "Journalist",
        "Manager",
        "Medical Assistant",
        "Merchant Marine",
      ],
    ],
    [
      "University",
      [
        "Analysis",
        "Anthropologist",
        "Archaeologist",
        "Detective",
        "Engineer",
        "Planetary Surveyor",
        "Medical Assistant",
        "Politician",
        "Technician - Mech",
        "Technician - Military",
      ],
    ],
  ])("preserves both affiliation outcomes for %s", (name, nonClanFields) => {
    const condition = 'affVar == "Invading Clan" || affVar == "Homeworld Clan"';
    const school = file.modules.find(
      (m) => m.stage === 3 && m.kind === "school" && m.name === name,
    );
    const branch = school?.conditionals.find((c) => c.condition === condition);
    const clanFields = [
      ...nonClanFields.slice(0, 5),
      "HPG Technician",
      ...nonClanFields.slice(5),
    ];
    expect(branch?.effects.fields?.advanced?.skills).toEqual(clanFields);
    expect(branch?.elseEffects?.fields?.advanced?.skills).toEqual(
      nonClanFields,
    );
    expect(
      file.gating.find(
        (g) => g.kind === "schoolFieldBranch" && g.name === name,
      ),
    ).toMatchObject({
      condition,
      effects: { fields: { advanced: { skills: clanFields } } },
    });
  });
});

describe("affiliation source agreement", () => {
  it("joins metadata and every emitted affiliation name to the desktop catalog", () => {
    expect(file.meta.affiliations).toEqual(sourceAffiliations);
    const lists = [
      ...file.modules.map((m) => m.availability),
      ...file.gating.flatMap((g) =>
        g.affiliations === undefined ? [] : [g.affiliations],
      ),
    ];
    for (const names of lists) {
      for (const name of names) {
        expect(typeof name).toBe("string");
        expect(Number.isNaN(Number(name))).toBe(true);
        expect(sourceAffiliations).toContain(name);
      }
    }
  });

  it("preserves unrestricted affiliation unions from the desktop offerings", () => {
    expect(byName("Ne'er-Do-Well", 4).availability).toEqual(sourceAffiliations);
    expect(byName("Covert Operations", 3).availability).toEqual(
      sourceAffiliations,
    );
  });
});
