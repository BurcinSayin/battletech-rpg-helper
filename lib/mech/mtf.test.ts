import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyMech, mechSchema, MECH_LIMITS } from "./schema";
import { MTF_MAX_CHARS, parseMtf } from "./mtf";
import { type MechData } from "./types";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const FIRESTARTER = fixture("firestarter-fs9-h.mtf");

function parseOk(text: string): MechData {
  const result = parseMtf(text);
  if (!result.ok) throw new Error(`expected parse to succeed: ${result.error}`);
  return result.mech;
}

function parseErr(text: unknown): string {
  const result = parseMtf(text);
  if (result.ok) throw new Error("expected parse to fail");
  return result.error;
}

/** Minimal valid MTF with a header, optional extra lines, and optional trailing sections. */
function mtf(body: string, header = "Version:1.0\nTest Chassis\nTM-1\n\n") {
  return `${header}Mass:20\nWalk MP:4\nJump MP:0\n${body}`;
}

describe("parseMtf: sample file", () => {
  const mech = parseOk(FIRESTARTER);

  it("reads identity, source, and mass/movement groups", () => {
    expect(mech).toMatchObject({
      chassis: "Firestarter",
      model: "FS9-H",
      config: "Biped",
      techBase: "Inner Sphere",
      era: "2703",
      source: "TRO 3039 - Star League",
      rulesLevel: "1",
      mass: 35,
      engine: "210 Fusion Engine",
      structure: "Standard",
      myomer: "Standard",
      heatSinks: "10 Single",
      walkMP: 6,
      jumpMP: 6,
      armorType: "Standard(Inner Sphere)",
      catalogFile: null,
      unsupported: [],
    });
    expect(mech).not.toHaveProperty("mulId");
  });

  it("keeps armor values in file order for all eleven locations", () => {
    expect(mech.armor).toEqual([
      { location: "LA", value: 6 },
      { location: "RA", value: 6 },
      { location: "LT", value: 11 },
      { location: "RT", value: 11 },
      { location: "CT", value: 13 },
      { location: "HD", value: 9 },
      { location: "LL", value: 8 },
      { location: "RL", value: 8 },
      { location: "RTL", value: 5 },
      { location: "RTR", value: 5 },
      { location: "RTC", value: 6 },
    ]);
  });

  it("keeps weapons in file order, including repeats", () => {
    expect(mech.weapons.map((w) => `${w.name}|${w.location}`)).toEqual([
      "Flamer|Center Torso",
      "Flamer|Center Torso",
      "Medium Laser|Left Arm",
      "Medium Laser|Right Arm",
      "Machine Gun|Left Torso",
      "Machine Gun|Right Torso",
      "Flamer|Left Arm",
      "Flamer|Right Arm",
    ]);
    expect(mech.weapons.every((w) => w.detail === undefined)).toBe(true);
  });

  it("keeps all eight critical-slot sections in order with 12 entries and -Empty- verbatim", () => {
    expect(mech.criticalSlots.map((s) => s.location)).toEqual([
      "Left Arm",
      "Right Arm",
      "Left Torso",
      "Right Torso",
      "Center Torso",
      "Head",
      "Left Leg",
      "Right Leg",
    ]);
    for (const section of mech.criticalSlots) {
      expect(section.slots).toHaveLength(12);
    }
    const leftArm = mech.criticalSlots[0]!.slots;
    expect(leftArm.slice(0, 5)).toEqual([
      "Shoulder",
      "Upper Arm Actuator",
      "Lower Arm Actuator",
      "Medium Laser",
      "Flamer",
    ]);
    expect(leftArm.slice(5).every((s) => s === "-Empty-")).toBe(true);

    const centerTorso = mech.criticalSlots[4]!.slots;
    expect(centerTorso).toEqual([
      "Fusion Engine",
      "Fusion Engine",
      "Fusion Engine",
      "Gyro",
      "Gyro",
      "Gyro",
      "Gyro",
      "Fusion Engine",
      "Fusion Engine",
      "Fusion Engine",
      "Flamer",
      "Flamer (R)",
    ]);
  });

  it("round-trips through mechSchema unchanged", () => {
    expect(mechSchema.parse(mech)).toEqual(mech);
  });

  it("produces the same record for CRLF line endings", () => {
    expect(parseOk(FIRESTARTER.replace(/\n/g, "\r\n"))).toEqual(mech);
  });

  it("strips a leading byte-order mark", () => {
    expect(parseOk(`\uFEFF${FIRESTARTER}`)).toEqual(mech);
  });
});

describe("parseMtf: format variants", () => {
  it("reads keyed headers, lowercase keys, and extra keys (Atlas II)", () => {
    const mech = parseOk(fixture("atlas-ii-as7-d-ht.mtf"));
    expect(mech).toMatchObject({
      chassis: "Atlas II",
      model: "AS7-D-HT",
      mulId: "7618",
      config: "Biped",
      techBase: "Inner Sphere",
      era: "2780",
      rulesLevel: "2",
      mass: 100,
      heatSinks: "11 IS Double",
      walkMP: 3,
      jumpMP: 0,
      armorType: "Ferro-Fibrous(Inner Sphere)",
    });
    expect(mech.armor.find((a) => a.location === "RTC")).toEqual({
      location: "RTC",
      value: 14,
    });
    expect(mech.unsupported).toContain("role:Juggernaut");
    expect(mech.unsupported).toContain("quirk:battle_fists_la");
  });

  it("maps quad leg armor codes and front/rear leg sections (Snow Fox)", () => {
    const mech = parseOk(fixture("snow-fox-omni-b-quad.mtf"));
    const locations = mech.armor.map((a) => a.location);
    expect(locations).toEqual(
      expect.arrayContaining(["FLL", "FRL", "RLL", "RRL"]),
    );
    expect(mech.criticalSlots.map((s) => s.location)).toEqual(
      expect.arrayContaining([
        "Front Left Leg",
        "Front Right Leg",
        "Rear Left Leg",
        "Rear Right Leg",
      ]),
    );
  });

  it("splits weapon detail after the location (Ammo counts)", () => {
    const mech = parseOk(
      mtf("Weapons:2\n1 CLATM6, Right Arm, Ammo:20\nMedium Laser, Left Arm\n"),
    );
    expect(mech.weapons).toEqual([
      { name: "1 CLATM6", location: "Right Arm", detail: "Ammo:20" },
      { name: "Medium Laser", location: "Left Arm" },
    ]);
  });

  it("accepts a header with no Version line", () => {
    const mech = parseOk("Chassis:Solo\nModel:X-1\n\nMass:25\nWalk MP:5\n");
    expect(mech).toMatchObject({ chassis: "Solo", model: "X-1", mass: 25 });
  });

  it("reads chassis and model from unlabeled header lines after Version", () => {
    expect(parseOk(mtf("", "Version:1.1\nFoo\nBar\n\n"))).toMatchObject({
      chassis: "Foo",
      model: "Bar",
      unsupported: [],
    });
  });
});

describe("parseMtf: sections and unknown lines", () => {
  it("retains unknown lines verbatim in order and never drops them", () => {
    const mech = parseOk(
      mtf(
        "Gyro:XL Gyro\n\nQuirks:\nSpiky\nBumpy\n\nCockpit:Small Cockpit\nFree text line\n",
      ),
    );
    expect(mech.unsupported).toEqual([
      "Gyro:XL Gyro",
      "Quirks:",
      "Spiky",
      "Bumpy",
      "Cockpit:Small Cockpit",
      "Free text line",
    ]);
  });

  it("keeps the first of duplicate scalar keys and retains the rest", () => {
    const mech = parseOk(mtf("Engine:first\nEngine:second\n"));
    expect(mech.engine).toBe("first");
    expect(mech.unsupported).toEqual(["Engine:second"]);
  });

  it("tolerates repeated blank lines between sections", () => {
    const mech = parseOk(
      mtf("\n\nLeft Arm:\nShoulder\n\n\nRight Arm:\nHip\n\n\n"),
    );
    expect(mech.criticalSlots).toEqual([
      { location: "Left Arm", slots: ["Shoulder"] },
      { location: "Right Arm", slots: ["Hip"] },
    ]);
    expect(mech.unsupported).toEqual([]);
  });

  it("preserves repeated slot contents and order exactly", () => {
    const mech = parseOk(
      mtf("Left Torso:\nJump Jet\nJump Jet\n-Empty-\nJump Jet\n\n"),
    );
    expect(mech.criticalSlots[0]!.slots).toEqual([
      "Jump Jet",
      "Jump Jet",
      "-Empty-",
      "Jump Jet",
    ]);
  });

  it("rejects an armor value that is not a whole number", () => {
    expect(parseErr(mtf("LA Armor:x\n"))).toMatch(/LA armor/);
  });

  it("moves slot entries beyond the cap into unsupported", () => {
    const entries = Array.from({ length: 20 }, (_, i) => `Item ${i}`).join(
      "\n",
    );
    const mech = parseOk(mtf(`Head:\n${entries}\n`));
    expect(mech.criticalSlots[0]!.slots).toHaveLength(
      MECH_LIMITS.slotsPerSection,
    );
    expect(mech.unsupported).toHaveLength(20 - MECH_LIMITS.slotsPerSection);
    expect(mech.unsupported[0]).toBe("Item 16");
  });

  it("moves a slot section beyond the cap into unsupported", () => {
    const sections = Array.from({ length: 17 }, () => "Head:\nSensors\n").join(
      "\n",
    );
    const mech = parseOk(mtf(sections));
    expect(mech.criticalSlots).toHaveLength(MECH_LIMITS.slotSections);
    expect(mech.unsupported).toEqual(["Head:", "Sensors"]);
  });

  it("clips overlong free text to its cap instead of failing", () => {
    const mech = parseOk(
      `Version:1.0\n${"C".repeat(300)}\nM\n\nMass:20\nWalk MP:4\nSource:${"S".repeat(400)}\n`,
    );
    expect(mech.chassis).toHaveLength(MECH_LIMITS.chassis);
    expect(mech.source).toHaveLength(MECH_LIMITS.source);
  });
});

describe("parseMtf: rejections", () => {
  it.each([null, undefined, 42, {}, ["Mass:20"]])(
    "rejects non-text input %j",
    (input) => {
      expect(parseErr(input)).toMatch(/must be text/);
    },
  );

  it("rejects an empty file", () => {
    expect(parseErr("")).toMatch(/missing chassis or mass/);
  });

  it("rejects text that is not a mech file", () => {
    expect(parseErr("hello world\nthis is not a mech\n")).toMatch(
      /missing chassis or mass/,
    );
  });

  it("rejects a file with a chassis but no mass", () => {
    expect(parseErr("Chassis:Solo\nModel:X\n\nWalk MP:4\n")).toMatch(
      /missing chassis or mass/,
    );
  });

  it("rejects a file with a mass but no chassis", () => {
    expect(parseErr("Mass:20\nWalk MP:4\n")).toMatch(/missing chassis or mass/);
  });

  it.each([
    ["Mass:20.5", /Mass must be a whole number/],
    ["Mass:heavy", /Mass must be a whole number/],
    ["Mass:-5", /Mass must be a whole number/],
    ["Walk MP:six", /Walk MP must be a whole number/],
    ["Jump MP:2.5", /Jump MP must be a whole number/],
  ])("rejects non-numeric %s", (line, pattern) => {
    expect(parseErr(`Chassis:Solo\n${line}\n`)).toMatch(pattern);
  });

  it("rejects a non-numeric weapon count", () => {
    expect(parseErr(mtf("Weapons:many\n"))).toMatch(/Weapon count/);
  });

  it("rejects values outside the schema bounds", () => {
    expect(parseErr("Chassis:Solo\nMass:201\n")).toMatch(/Invalid mass/);
    expect(parseErr("Chassis:Solo\nMass:20\nWalk MP:100\n")).toMatch(/walkMP/);
    expect(parseErr(mtf("LA Armor:1000\n"))).toMatch(/armor/i);
  });

  it("rejects text over the whole-file cap before parsing", () => {
    const text = `${FIRESTARTER}${"x".repeat(MTF_MAX_CHARS)}`;
    expect(parseErr(text)).toMatch(/too large/);
  });

  it("rejects a file whose unrecognized lines overflow the cap", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Note ${i}`).join("\n");
    expect(parseErr(mtf(`${lines}\n`))).toMatch(/too many unrecognized/);
  });

  it("moves weapons beyond the cap into unsupported instead of dropping them", () => {
    const lines = Array.from(
      { length: MECH_LIMITS.weapons + 1 },
      () => "Flamer, Left Arm",
    ).join("\n");
    const mech = parseOk(mtf(`Weapons:${MECH_LIMITS.weapons + 1}\n${lines}\n`));
    expect(mech.weapons).toHaveLength(MECH_LIMITS.weapons);
    expect(mech.unsupported).toEqual(["Flamer, Left Arm"]);
  });
});

describe("mechSchema", () => {
  it("accepts the empty manual-entry record", () => {
    expect(mechSchema.safeParse(emptyMech()).success).toBe(true);
  });

  it("emptyMech has the eleven armor locations and eight slot sections", () => {
    const mech = emptyMech();
    expect(mech.armor.map((a) => a.location)).toEqual([
      "LA",
      "RA",
      "LT",
      "RT",
      "CT",
      "HD",
      "LL",
      "RL",
      "RTL",
      "RTR",
      "RTC",
    ]);
    expect(mech.criticalSlots).toHaveLength(8);
    for (const section of mech.criticalSlots) {
      expect(section.slots).toEqual(Array(12).fill("-Empty-"));
    }
    expect(mech.catalogFile).toBeNull();
  });

  it.each([
    ["mass above 200", { mass: 201 }],
    ["mass below 0", { mass: -1 }],
    ["mass not an integer", { mass: 20.5 }],
    ["walkMP above 99", { walkMP: 100 }],
    ["jumpMP not a number", { jumpMP: "2" }],
    ["armor value above 999", { armor: [{ location: "LA", value: 1000 }] }],
    [
      "too many weapons",
      {
        weapons: Array.from({ length: MECH_LIMITS.weapons + 1 }, () => ({
          name: "Flamer",
          location: "Head",
        })),
      },
    ],
    ["chassis too long", { chassis: "x".repeat(MECH_LIMITS.chassis + 1) }],
    [
      "too many unsupported lines",
      {
        unsupported: Array(MECH_LIMITS.unsupportedLines + 1).fill("x"),
      },
    ],
    [
      "slot entry too long",
      {
        criticalSlots: [
          { location: "Head", slots: ["x".repeat(MECH_LIMITS.slotEntry + 1)] },
        ],
      },
    ],
  ])("rejects %s", (_label, override) => {
    expect(mechSchema.safeParse({ ...emptyMech(), ...override }).success).toBe(
      false,
    );
  });

  it("rejects a record over the serialized size budget even when each field is in bounds", () => {
    const big: MechData = {
      ...emptyMech(),
      unsupported: Array(MECH_LIMITS.unsupportedLines).fill(
        "u".repeat(MECH_LIMITS.unsupportedLine),
      ),
      weapons: Array.from({ length: MECH_LIMITS.weapons }, () => ({
        name: "w".repeat(MECH_LIMITS.weaponName),
        location: "l".repeat(MECH_LIMITS.weaponLocation),
        detail: "d".repeat(MECH_LIMITS.weaponDetail),
      })),
      criticalSlots: Array.from({ length: MECH_LIMITS.slotSections }, () => ({
        location: "h".repeat(MECH_LIMITS.slotSectionName),
        slots: Array(MECH_LIMITS.slotsPerSection).fill(
          "s".repeat(MECH_LIMITS.slotEntry),
        ),
      })),
    };
    expect(JSON.stringify(big).length).toBeGreaterThan(
      MECH_LIMITS.serializedBytes,
    );
    expect(mechSchema.safeParse(big).success).toBe(false);
  });
});
